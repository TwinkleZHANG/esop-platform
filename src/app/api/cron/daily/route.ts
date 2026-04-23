import {
  GrantStatus,
  OperationRequestStatus,
  PlanType,
  Prisma,
  TaxEventStatus,
  TaxEventType,
  VestingRecordStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api-utils";
import { createStatusLog } from "@/lib/audit";
import { computeGrantStatus } from "@/lib/state-machine";
import { getFMVForDate } from "@/lib/valuation";

/**
 * 每日 00:00 UTC+8 执行（PRD 10）。四个子任务：
 *   1) Vesting 检查：PENDING → VESTED；Option 同步 exercisableOptions + grant.operableOptions
 *   2) RSU 归属税务事件生成：Vested 时按 FMV 取值，无估值则跳过并记入缺口
 *   3) Grant 状态推进：聚合 computeGrantStatus
 *   4) Closing 窗口期到期：operableOptions 清零，Vested/Partially Settled → CLOSED，Grant → CLOSED，未审批行权申请 → CLOSED
 *
 * 鉴权：若设置 CRON_SECRET，则要求请求头 X-Cron-Token 匹配；未设置则开发环境直接放行。
 */

const OPERATOR = "系统自动触发";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("x-cron-token");
    if (got !== expected) return fail("无权限", 401);
  }

  const now = new Date();

  const result = {
    vestedRecords: 0,
    rsuTaxEventsCreated: 0,
    valuationMissing: 0,
    grantsAdvanced: 0,
    closingExpired: 0,
  };

  // ========== 1) Vesting 检查 ==========
  const due = await prisma.vestingRecord.findMany({
    where: {
      status: VestingRecordStatus.PENDING,
      vestingDate: { lte: now },
    },
    include: {
      grant: { include: { plan: { select: { type: true } } } },
    },
  });

  // 按 Grant 聚集，一次事务处理同一 Grant 的所有到期记录
  const byGrant = new Map<string, typeof due>();
  for (const r of due) {
    const list = byGrant.get(r.grantId) ?? [];
    list.push(r);
    byGrant.set(r.grantId, list);
  }

  for (const [grantId, records] of byGrant) {
    const grant = records[0].grant;
    const isOption = grant.plan.type === PlanType.OPTION;

    await prisma.$transaction(async (tx) => {
      let optionsDelta = new Prisma.Decimal(0);

      for (const rec of records) {
        await tx.vestingRecord.update({
          where: { id: rec.id },
          data: {
            status: VestingRecordStatus.VESTED,
            actualVestDate: now,
            exercisableOptions: isOption ? rec.quantity : new Prisma.Decimal(0),
          },
        });
        result.vestedRecords += 1;

        if (isOption) {
          optionsDelta = optionsDelta.add(rec.quantity);
        } else {
          // RSU：生成归属税务事件
          const fmv = await getFMVForDate(rec.vestingDate);
          if (!fmv) {
            result.valuationMissing += 1;
            continue;
          }
          await tx.taxEvent.create({
            data: {
              grantId: grant.id,
              userId: grant.userId,
              eventType: TaxEventType.VESTING_TAX,
              operationType: "归属",
              operationTarget: null,
              quantity: rec.quantity,
              eventDate: now,
              fmvAtEvent: fmv.fmv,
              valuationId: fmv.id,
              vestingRecordId: rec.id,
              strikePrice: new Prisma.Decimal(0),
              status: TaxEventStatus.PENDING_PAYMENT,
              operationRequestId: null,
            },
          });
          result.rsuTaxEventsCreated += 1;
        }
      }

      if (isOption && optionsDelta.gt(0)) {
        await tx.grant.update({
          where: { id: grant.id },
          data: { operableOptions: { increment: optionsDelta } },
        });
      }
    });
  }

  // ========== 2) Grant 状态推进 ==========
  // 扫描所有 vestingRecords 非终态（非 CLOSED）的 Grant，聚合推断并推进
  const candidates = await prisma.grant.findMany({
    where: {
      status: {
        in: [
          GrantStatus.GRANTED,
          GrantStatus.VESTING,
          GrantStatus.FULLY_VESTED,
          GrantStatus.STILL_EXERCISABLE,
        ],
      },
    },
    include: {
      plan: { select: { type: true } },
      vestingRecords: { select: { status: true } },
    },
  });

  for (const g of candidates) {
    const target = computeGrantStatus(
      { status: g.status, planType: g.plan.type },
      g.vestingRecords
    );
    if (target !== g.status) {
      await prisma.$transaction(async (tx) => {
        await tx.grant.update({
          where: { id: g.id },
          data: { status: target },
        });
        await createStatusLog(g.id, g.status, target, OPERATOR, null, tx);
      });
      result.grantsAdvanced += 1;
    }
  }

  // ========== 3) Closing 窗口期到期 ==========
  const expiring = await prisma.grant.findMany({
    where: {
      status: GrantStatus.CLOSING,
      exerciseWindowDeadline: { lte: now },
    },
    select: { id: true, status: true },
  });

  for (const g of expiring) {
    await prisma.$transaction(async (tx) => {
      // 释放未行权额度：operableOptions 清零
      await tx.grant.update({
        where: { id: g.id },
        data: {
          status: GrantStatus.CLOSED,
          operableOptions: new Prisma.Decimal(0),
        },
      });
      // VESTED / PARTIALLY_SETTLED 归属记录 → CLOSED
      await tx.vestingRecord.updateMany({
        where: {
          grantId: g.id,
          status: {
            in: [
              VestingRecordStatus.VESTED,
              VestingRecordStatus.PARTIALLY_SETTLED,
            ],
          },
        },
        data: { status: VestingRecordStatus.CLOSED },
      });
      // 待审批的行权申请 → CLOSED
      await tx.operationRequest.updateMany({
        where: {
          grantId: g.id,
          status: OperationRequestStatus.PENDING,
        },
        data: { status: OperationRequestStatus.CLOSED },
      });
      await createStatusLog(
        g.id,
        GrantStatus.CLOSING,
        GrantStatus.CLOSED,
        OPERATOR,
        "行权窗口期到期",
        tx
      );
    });
    result.closingExpired += 1;
  }

  return ok(result);
}

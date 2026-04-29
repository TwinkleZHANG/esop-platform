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
    exercisePeriodExpired: 0,
    errors: [] as { phase: string; grantId: string; message: string }[],
  };

  function recordError(phase: string, grantId: string, e: unknown) {
    result.errors.push({
      phase,
      grantId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

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

    try {
      // 提前拉 FMV（事务外，不让外部依赖卡死事务）
      const fmvByRecord = new Map<
        string,
        { id: string; fmv: Prisma.Decimal } | null
      >();
      if (!isOption) {
        for (const rec of records) {
          fmvByRecord.set(rec.id, await getFMVForDate(rec.vestingDate));
        }
      }

      await prisma.$transaction(async (tx) => {
        let optionsDelta = new Prisma.Decimal(0);

        for (const rec of records) {
          await tx.vestingRecord.update({
            where: { id: rec.id },
            data: {
              status: VestingRecordStatus.VESTED,
              actualVestDate: now,
              exercisableOptions: isOption
                ? rec.quantity
                : new Prisma.Decimal(0),
            },
          });
          result.vestedRecords += 1;

          if (isOption) {
            optionsDelta = optionsDelta.add(rec.quantity);
          } else {
            // RSU：生成归属税务事件（FMV 已预取）
            const fmv = fmvByRecord.get(rec.id);
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
    } catch (e) {
      recordError("vesting", grantId, e);
    }
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
      try {
        await prisma.$transaction(async (tx) => {
          await tx.grant.update({
            where: { id: g.id },
            data: { status: target },
          });
          await createStatusLog(g.id, g.status, target, OPERATOR, null, tx);
        });
        result.grantsAdvanced += 1;
      } catch (e) {
        recordError("grantAdvance", g.id, e);
      }
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
    try {
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
    } catch (e) {
      recordError("closingExpire", g.id, e);
    }
  }

  // ========== 4) 行权期到期检查（仅 Option） ==========
  // 扫描 exerciseDeadline 已过的非终态 Option Grant：
  //   operableOptions → 0；VESTED / PARTIALLY_SETTLED → CLOSED；
  //   PENDING 行权申请 → CLOSED；Grant → CLOSED；
  //   未行权额度通过 plan-quantity 自动释放回池（CLOSED 仅计 Settled 部分）。
  const exerciseExpired = await prisma.grant.findMany({
    where: {
      exerciseDeadline: { lte: now },
      status: {
        in: [
          GrantStatus.GRANTED,
          GrantStatus.VESTING,
          GrantStatus.FULLY_VESTED,
          GrantStatus.STILL_EXERCISABLE,
          GrantStatus.CLOSING,
        ],
      },
      plan: { type: PlanType.OPTION },
    },
    select: { id: true, status: true },
  });

  const EXERCISE_OPERATOR = "系统自动触发 - 行权期到期";
  for (const g of exerciseExpired) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.grant.update({
          where: { id: g.id },
          data: {
            status: GrantStatus.CLOSED,
            operableOptions: new Prisma.Decimal(0),
          },
        });
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
        await tx.operationRequest.updateMany({
          where: {
            grantId: g.id,
            status: OperationRequestStatus.PENDING,
          },
          data: { status: OperationRequestStatus.CLOSED },
        });
        await createStatusLog(
          g.id,
          g.status,
          GrantStatus.CLOSED,
          EXERCISE_OPERATOR,
          "行权期到期",
          tx
        );
      });
      result.exercisePeriodExpired += 1;
    } catch (e) {
      recordError("exerciseExpire", g.id, e);
    }
  }

  return ok(result);
}

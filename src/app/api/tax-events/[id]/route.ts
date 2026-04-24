import {
  OperationTarget,
  TaxEventStatus,
  TaxEventType,
  VestingRecordStatus,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";
import { allocateByFIFO } from "@/lib/settlement";
import { computeGrantStatus } from "@/lib/state-machine";
import { createStatusLog } from "@/lib/audit";

const patchSchema = z.object({
  action: z.literal("CONFIRM"),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("taxEvent.export");
  if (isErrorResponse(guard)) return guard;

  const t = await prisma.taxEvent.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: { id: true, name: true, employeeId: true, email: true },
      },
      grant: {
        select: {
          id: true,
          strikePrice: true,
          plan: { select: { id: true, title: true, type: true } },
        },
      },
      operationRequest: {
        select: { id: true, requestType: true, requestTarget: true },
      },
      valuation: {
        select: { id: true, valuationDate: true, fmv: true },
      },
      vestingRecord: {
        select: { id: true, vestingDate: true },
      },
    },
  });
  if (!t) return fail("税务事件不存在", 404);

  return ok({
    ...t,
    quantity: t.quantity.toFixed(0),
    fmvAtEvent: t.fmvAtEvent.toFixed(2),
    strikePrice: t.strikePrice.toFixed(2),
    grant: {
      ...t.grant,
      strikePrice: t.grant.strikePrice.toFixed(2),
    },
    valuation: t.valuation && {
      ...t.valuation,
      fmv: t.valuation.fmv.toFixed(2),
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  // 仅审批管理员和超管可确认（PRD 4.6）
  const session = await requirePermission("taxEvent.confirm");
  if (isErrorResponse(session)) return session;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("参数错误");

  const t = await prisma.taxEvent.findUnique({
    where: { id: params.id },
    include: {
      grant: {
        include: { plan: { select: { type: true } } },
      },
    },
  });
  if (!t) return fail("税务事件不存在", 404);
  if (t.status !== TaxEventStatus.RECEIPT_UPLOADED) {
    return fail("仅「已上传凭证」状态可确认");
  }

  const operator = session.user.name ?? session.user.email ?? "系统";

  // RSU 归属税务必须关联一条归属记录（由 cron 生成时写入）；否则拒绝
  if (t.eventType === TaxEventType.VESTING_TAX && !t.vestingRecordId) {
    return fail("数据异常：归属税务事件缺少 vestingRecordId，无法确认");
  }

  try {
    await prisma.$transaction(async (tx) => {
    // 1) 置为 CONFIRMED
    await tx.taxEvent.update({
      where: { id: t.id },
      data: { status: TaxEventStatus.CONFIRMED },
    });

    // 2) 按事件类型分流，更新 Grant 字段和 VestingRecord 状态
    if (t.eventType === TaxEventType.VESTING_TAX) {
      // RSU：归属记录 VESTED → SETTLED；operableShares += quantity
      if (t.vestingRecordId) {
        await tx.vestingRecord.update({
          where: { id: t.vestingRecordId },
          data: { status: VestingRecordStatus.SETTLED },
        });
      }
      await tx.grant.update({
        where: { id: t.grantId },
        data: { operableShares: { increment: t.quantity } },
      });
    } else if (t.eventType === TaxEventType.EXERCISE_TAX) {
      // Option 行权：FIFO 消耗归属记录；operableOptions -= ，operableShares +=
      const records = await tx.vestingRecord.findMany({
        where: {
          grantId: t.grantId,
          status: {
            in: [
              VestingRecordStatus.VESTED,
              VestingRecordStatus.PARTIALLY_SETTLED,
            ],
          },
        },
        orderBy: { vestingDate: "asc" },
      });
      const allocations = allocateByFIFO(
        records.map((r) => ({
          id: r.id,
          vestingDate: r.vestingDate,
          quantity: r.quantity,
          exercisableOptions: r.exercisableOptions,
          status: r.status,
        })),
        t.quantity
      );
      for (const a of allocations) {
        await tx.vestingRecord.update({
          where: { id: a.recordId },
          data: {
            exercisableOptions: a.newExercisableOptions,
            status: a.newStatus,
          },
        });
      }
      await tx.grant.update({
        where: { id: t.grantId },
        data: {
          operableOptions: { decrement: t.quantity },
          operableShares: { increment: t.quantity },
        },
      });
    } else if (t.eventType === TaxEventType.POST_SETTLEMENT_TAX) {
      // Post-settlement：
      //   target=SHARES → operableShares -= quantity
      //   target=OPTIONS → FIFO 消耗归属记录 + operableOptions -= quantity（PRD 3.8 最后一段）
      if (t.operationTarget === OperationTarget.OPTIONS) {
        const records = await tx.vestingRecord.findMany({
          where: {
            grantId: t.grantId,
            status: {
              in: [
                VestingRecordStatus.VESTED,
                VestingRecordStatus.PARTIALLY_SETTLED,
              ],
            },
          },
          orderBy: { vestingDate: "asc" },
        });
        const allocations = allocateByFIFO(
          records.map((r) => ({
            id: r.id,
            vestingDate: r.vestingDate,
            quantity: r.quantity,
            exercisableOptions: r.exercisableOptions,
            status: r.status,
          })),
          t.quantity
        );
        for (const a of allocations) {
          await tx.vestingRecord.update({
            where: { id: a.recordId },
            data: {
              exercisableOptions: a.newExercisableOptions,
              status: a.newStatus,
            },
          });
        }
        await tx.grant.update({
          where: { id: t.grantId },
          data: { operableOptions: { decrement: t.quantity } },
        });
      } else {
        // SHARES（默认）
        await tx.grant.update({
          where: { id: t.grantId },
          data: { operableShares: { decrement: t.quantity } },
        });
      }
    }

    // 3) 聚合推进 Grant 状态
    const updatedGrant = await tx.grant.findUniqueOrThrow({
      where: { id: t.grantId },
      include: {
        plan: { select: { type: true } },
        vestingRecords: { select: { status: true } },
      },
    });
    const nextStatus = computeGrantStatus(
      { status: updatedGrant.status, planType: updatedGrant.plan.type },
      updatedGrant.vestingRecords
    );
    if (nextStatus !== updatedGrant.status) {
      await tx.grant.update({
        where: { id: updatedGrant.id },
        data: { status: nextStatus },
      });
      await createStatusLog(
        updatedGrant.id,
        updatedGrant.status,
        nextStatus,
        operator,
        `税务事件确认（${t.operationType}）`,
        tx
      );
    }
    });
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : "确认税务事件失败",
      500
    );
  }

  return ok({ id: t.id, status: TaxEventStatus.CONFIRMED });
}

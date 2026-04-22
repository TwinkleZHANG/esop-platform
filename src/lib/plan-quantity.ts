import {
  GrantStatus,
  PlanType,
  Prisma,
  VestingRecordStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const D = Prisma.Decimal;

/**
 * 计算单个计划的"已授予数量"（PRD 4.1）：
 *   已授予数量 = Σ(非 Closed Grant 的 totalQuantity)
 *              + Σ(Closed Grant 中已消耗的数量)
 * 其中已消耗：
 *   - RSU Closed Grant：Vested / Settled 归属记录的 quantity 之和
 *   - Option Closed Grant：Settled 归属记录的 quantity 之和
 */
export async function computePlanGrantedQuantity(
  planId: string,
  planType: PlanType
): Promise<Prisma.Decimal> {
  const grants = await prisma.grant.findMany({
    where: { planId },
    select: { id: true, totalQuantity: true, status: true },
  });

  let granted = new D(0);

  const closedGrantIds: string[] = [];
  for (const g of grants) {
    if (g.status === GrantStatus.CLOSED) {
      closedGrantIds.push(g.id);
    } else {
      granted = granted.add(g.totalQuantity);
    }
  }

  if (closedGrantIds.length > 0) {
    const consumedStatuses =
      planType === PlanType.RSU
        ? [VestingRecordStatus.VESTED, VestingRecordStatus.SETTLED]
        : [VestingRecordStatus.SETTLED];

    const agg = await prisma.vestingRecord.aggregate({
      where: {
        grantId: { in: closedGrantIds },
        status: { in: consumedStatuses },
      },
      _sum: { quantity: true },
    });

    if (agg._sum.quantity) {
      granted = granted.add(agg._sum.quantity);
    }
  }

  return granted;
}

/** 批量计算（用于列表页），按 planId 返回 Decimal */
export async function computePlansGrantedQuantities(
  plans: { id: string; type: PlanType }[]
): Promise<Record<string, Prisma.Decimal>> {
  const out: Record<string, Prisma.Decimal> = {};
  await Promise.all(
    plans.map(async (p) => {
      out[p.id] = await computePlanGrantedQuantity(p.id, p.type);
    })
  );
  return out;
}

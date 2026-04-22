import {
  OperationRequestStatus,
  PlanStatus,
  TaxEventStatus,
  VestingRecordStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requireSession } from "@/lib/api-utils";

export async function GET() {
  const guard = await requireSession();
  if (isErrorResponse(guard)) return guard;

  const now = new Date();

  const [pendingPlans, pendingRequests, pendingTaxEvents] = await Promise.all([
    prisma.plan.count({ where: { status: PlanStatus.PENDING_APPROVAL } }),
    prisma.operationRequest.count({
      where: { status: OperationRequestStatus.PENDING },
    }),
    prisma.taxEvent.count({
      where: { status: TaxEventStatus.RECEIPT_UPLOADED },
    }),
  ]);

  // 估值缺口（PRD 9.4）：有 PENDING 归属记录 vestingDate 已到期（<= today）
  // 且在该日期前没有任何估值记录，无法生成税务事件 → 固定显示「1」
  const dueVestings = await prisma.vestingRecord.findMany({
    where: {
      status: VestingRecordStatus.PENDING,
      vestingDate: { lte: now },
    },
    select: { vestingDate: true },
    orderBy: { vestingDate: "asc" },
    take: 1,
  });
  let valuationGap = 0;
  if (dueVestings.length > 0) {
    const earliest = dueVestings[0].vestingDate;
    const hasValuation = await prisma.valuation.findFirst({
      where: { valuationDate: { lte: earliest } },
      select: { id: true },
    });
    if (!hasValuation) valuationGap = 1;
  }

  return ok({
    plans: pendingPlans,
    valuations: valuationGap,
    grants: pendingRequests,
    taxEvents: pendingTaxEvents,
  });
}

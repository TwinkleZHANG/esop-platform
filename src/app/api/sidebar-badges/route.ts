import {
  GrantStatus,
  OperationRequestStatus,
  PlanStatus,
  TaxEventStatus,
  VestingRecordStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requirePermission } from "@/lib/api-utils";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  // 仅管理端使用此接口；员工端有独立的 /api/employee/alerts
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const role = guard.user.role;
  // 审批类角标仅审批管理员/超级管理员可见（PRD 7.2 + Maker-Checker）
  const canSeeApprovals = hasPermission(role, "plan.approve");
  const canSeeRequestApprovals = hasPermission(role, "operationRequest.approve");
  const canSeeGrantAdvance = hasPermission(role, "grant.advance");
  const canSeeTaxConfirm = hasPermission(role, "taxEvent.confirm");

  const now = new Date();

  const [pendingPlans, pendingRequests, pendingDraftGrants, pendingTaxEvents] =
    await Promise.all([
      canSeeApprovals
        ? prisma.plan.count({ where: { status: PlanStatus.PENDING_APPROVAL } })
        : Promise.resolve(0),
      canSeeRequestApprovals
        ? prisma.operationRequest.count({
            where: { status: OperationRequestStatus.PENDING },
          })
        : Promise.resolve(0),
      canSeeGrantAdvance
        ? prisma.grant.count({ where: { status: GrantStatus.DRAFT } })
        : Promise.resolve(0),
      canSeeTaxConfirm
        ? prisma.taxEvent.count({
            where: { status: TaxEventStatus.RECEIPT_UPLOADED },
          })
        : Promise.resolve(0),
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

  // 授予管理角标 = 待审批申请数 + 待推进 Draft 授予数（Step 5）
  return ok({
    plans: pendingPlans,
    valuations: valuationGap,
    grants: pendingRequests + pendingDraftGrants,
    taxEvents: pendingTaxEvents,
  });
}

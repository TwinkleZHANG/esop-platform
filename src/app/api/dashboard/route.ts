import {
  OperationRequestStatus,
  PlanStatus,
  TaxEventStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requirePermission } from "@/lib/api-utils";

export async function GET() {
  // 管理端 Dashboard 聚合数据；员工无权访问
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const [
    employeesTotal,
    employeesActive,
    plansTotal,
    plansApproved,
    grantsTotal,
    grantsWithPendingRequests,
    taxEventsTotal,
    taxEventsPendingConfirm,
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.EMPLOYEE } }),
    prisma.user.count({
      where: { role: UserRole.EMPLOYEE, employmentStatus: "在职" },
    }),
    prisma.plan.count(),
    prisma.plan.count({ where: { status: PlanStatus.APPROVED } }),
    prisma.grant.count(),
    prisma.grant.count({
      where: {
        operationRequests: {
          some: { status: OperationRequestStatus.PENDING },
        },
      },
    }),
    prisma.taxEvent.count(),
    prisma.taxEvent.count({
      where: { status: TaxEventStatus.RECEIPT_UPLOADED },
    }),
  ]);

  return ok({
    employees: { total: employeesTotal, active: employeesActive },
    plans: { total: plansTotal, approved: plansApproved },
    grants: { total: grantsTotal, withPendingRequests: grantsWithPendingRequests },
    taxEvents: {
      total: taxEventsTotal,
      pendingConfirm: taxEventsPendingConfirm,
    },
  });
}

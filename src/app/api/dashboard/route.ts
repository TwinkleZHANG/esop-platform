import {
  OperationRequestStatus,
  PlanStatus,
  TaxEventStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requireSession } from "@/lib/api-utils";

export async function GET() {
  const guard = await requireSession();
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

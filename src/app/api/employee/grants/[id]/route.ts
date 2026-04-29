import { prisma } from "@/lib/prisma";
import { fail, isErrorResponse, ok, requireSession } from "@/lib/api-utils";
import { formatUtc8 } from "@/lib/audit";

/**
 * 员工端授予详情：按 session.user.id 过滤，员工和管理员均可访问自己的数据。
 * 员工端不展示 Draft 状态。
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  const grant = await prisma.grant.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      plan: { select: { id: true, title: true, type: true, jurisdiction: true } },
      holdingEntity: { select: { id: true, name: true } },
      vestingRecords: { orderBy: { vestingDate: "asc" } },
      taxEvents: { orderBy: { eventDate: "desc" } },
      operationRequests: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { submitDate: "desc" },
      },
      statusLogs: { orderBy: { timestamp: "desc" } },
    },
  });
  if (!grant) return fail("授予不存在", 404);
  if (grant.status === "DRAFT") return fail("授予不存在", 404);

  return ok({
    id: grant.id,
    plan: grant.plan,
    holdingEntity: grant.holdingEntity,
    grantDate: grant.grantDate,
    vestingStartDate: grant.vestingStartDate,
    totalQuantity: grant.totalQuantity.toFixed(0),
    strikePrice: grant.strikePrice.toFixed(2),
    agreementId: grant.agreementId,
    vestingYears: grant.vestingYears,
    cliffMonths: grant.cliffMonths,
    vestingFrequency: grant.vestingFrequency,
    exercisePeriodYears: grant.exercisePeriodYears,
    exerciseDeadline: grant.exerciseDeadline,
    status: grant.status,
    operableShares: grant.operableShares.toFixed(0),
    operableOptions: grant.operableOptions.toFixed(0),
    closedReason: grant.closedReason,
    exerciseWindowDeadline: grant.exerciseWindowDeadline,
    exerciseWindowDays: grant.exerciseWindowDays,
    vestingRecords: grant.vestingRecords.map((v) => ({
      id: v.id,
      vestingDate: v.vestingDate,
      quantity: v.quantity.toFixed(0),
      exercisableOptions: v.exercisableOptions.toFixed(0),
      status: v.status,
      actualVestDate: v.actualVestDate,
    })),
    taxEvents: grant.taxEvents.map((t) => ({
      id: t.id,
      eventType: t.eventType,
      operationType: t.operationType,
      quantity: t.quantity.toFixed(0),
      eventDate: t.eventDate,
      fmvAtEvent: t.fmvAtEvent.toFixed(2),
      status: t.status,
    })),
    operationRequests: grant.operationRequests.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      requestTarget: r.requestTarget,
      quantity: r.quantity.toFixed(0),
      status: r.status,
      submitDate: r.submitDate,
      approveDate: r.approveDate,
      approverNotes: r.approverNotes,
    })),
    statusLogs: grant.statusLogs.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      operatorName: l.operatorName,
      legalDocument: l.legalDocument,
      timestamp: l.timestamp,
      timestampDisplay: formatUtc8(l.timestamp),
    })),
  });
}

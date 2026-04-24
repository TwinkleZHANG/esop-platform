import {
  OperationRequestStatus,
  OperationRequestType,
  PlanType,
  Prisma,
  TaxEventStatus,
  TaxEventType,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
  requireSession,
} from "@/lib/api-utils";
import { getFMVForDate } from "@/lib/valuation";

const patchSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  approverNotes: z.string().optional().nullable(),
});

const OPERATION_TYPE_LABEL: Record<OperationRequestType, string> = {
  EXERCISE: "行权",
  TRANSFER: "转让",
  SELL: "售出",
  BUYBACK: "回购",
  REDEEM: "兑现",
};

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("operationRequest.approve");
  if (isErrorResponse(guard)) return guard;
  const session = await requireSession();
  if (isErrorResponse(session)) return session;
  const approverId = session.user.id;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const reqRow = await prisma.operationRequest.findUnique({
    where: { id: params.id },
    include: { grant: { include: { plan: { select: { type: true } } } } },
  });
  if (!reqRow) return fail("申请不存在", 404);
  if (reqRow.status !== OperationRequestStatus.PENDING) {
    return fail("仅待审批的申请可审批");
  }

  if (d.decision === "REJECT") {
    const updated = await prisma.operationRequest.update({
      where: { id: reqRow.id },
      data: {
        status: OperationRequestStatus.REJECTED,
        approveDate: new Date(),
        approverId,
        approverNotes: d.approverNotes || null,
      },
    });
    return ok({ id: updated.id, status: updated.status });
  }

  // APPROVE：生成税务事件（PRD 3.7 / 8.2）
  const eventDate = new Date();
  const fmv = await getFMVForDate(eventDate);
  if (!fmv) {
    return fail(
      `触发日 ${eventDate.toLocaleDateString("zh-CN")} 之前无估值记录，请先在估值管理添加估值`
    );
  }

  const isExercise = reqRow.requestType === OperationRequestType.EXERCISE;
  const eventType = isExercise
    ? TaxEventType.EXERCISE_TAX
    : TaxEventType.POST_SETTLEMENT_TAX;

  // 行权税务：strikePrice 使用 Grant 的行权价（RSU 恒为 0）
  // Post-settlement：strikePrice = 0
  const strikePrice = isExercise
    ? reqRow.grant.strikePrice
    : new Prisma.Decimal(0);

  // operationTarget：仅 Option post-settlement 需要保留（区分 SHARES/OPTIONS）；EXERCISE 为 null
  const operationTarget = isExercise ? null : reqRow.requestTarget;

  const updated = await prisma.$transaction(async (tx) => {
    const approved = await tx.operationRequest.update({
      where: { id: reqRow.id },
      data: {
        status: OperationRequestStatus.APPROVED,
        approveDate: eventDate,
        approverId,
        approverNotes: d.approverNotes || null,
      },
    });

    await tx.taxEvent.create({
      data: {
        grantId: reqRow.grantId,
        userId: reqRow.userId,
        eventType,
        operationType: OPERATION_TYPE_LABEL[reqRow.requestType],
        operationTarget,
        quantity: reqRow.quantity,
        eventDate,
        fmvAtEvent: fmv.fmv,
        valuationId: fmv.id,
        strikePrice,
        status: TaxEventStatus.PENDING_PAYMENT,
        operationRequestId: reqRow.id,
      },
    });

    return approved;
  });

  // RSU 的 plan.type 兼容（目前审批只走 Option / post-settlement 路径；RSU 归属税务由定时任务生成）
  void PlanType;

  return ok({ id: updated.id, status: updated.status });
}

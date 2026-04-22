import { OperationRequestStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

const patchSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  approverNotes: z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("operationRequest.approve");
  if (isErrorResponse(guard)) return guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const reqRow = await prisma.operationRequest.findUnique({
    where: { id: params.id },
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
        approverNotes: d.approverNotes || null,
      },
    });
    return ok({ id: updated.id, status: updated.status });
  }

  // APPROVE
  const updated = await prisma.operationRequest.update({
    where: { id: reqRow.id },
    data: {
      status: OperationRequestStatus.APPROVED,
      approveDate: new Date(),
      approverNotes: d.approverNotes || null,
    },
  });

  // TODO(session-5): 审批通过后生成税务事件（PRD 3.7 / 8.2）
  //   - 行权：TaxEventType.EXERCISE_TAX，eventDate = now，fmvAtEvent = getFMVForDate(now).fmv
  //   - Post-settlement：TaxEventType.POST_SETTLEMENT_TAX
  //   - 关联 operationRequestId；税务确认后再消耗 operableShares/operableOptions（非此处）

  return ok({ id: updated.id, status: updated.status });
}

import { ValuationLogAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("valuation.create");
  if (isErrorResponse(guard)) return guard;

  const v = await prisma.valuation.findUnique({ where: { id: params.id } });
  if (!v) return fail("估值记录不存在", 404);
  return ok({ ...v, fmv: v.fmv.toFixed(2) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("valuation.create");
  if (isErrorResponse(guard)) return guard;

  const v = await prisma.valuation.findUnique({ where: { id: params.id } });
  if (!v) return fail("估值记录不存在", 404);

  // PRD 4.4：已被税务事件引用的不可删除
  const refCount = await prisma.taxEvent.count({
    where: { valuationId: v.id },
  });
  if (refCount > 0) {
    return fail("该估值记录已被引用，无法删除");
  }

  await prisma.$transaction(async (tx) => {
    // 先写日志（valuationId 仍存在，便于关联），再删；onDelete: SetNull 会自动清空 valuationId
    await tx.valuationLog.create({
      data: {
        valuationId: v.id,
        action: ValuationLogAction.DELETED,
        fmv: v.fmv,
        valuationDate: v.valuationDate,
        operatorId: guard.user.id,
        operatorName: guard.user.name ?? guard.user.email ?? "系统",
      },
    });
    await tx.valuation.delete({ where: { id: v.id } });
  });
  return ok({ deleted: true });
}

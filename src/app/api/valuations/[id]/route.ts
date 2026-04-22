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
  return ok({ ...v, fmv: v.fmv.toString() });
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

  await prisma.valuation.delete({ where: { id: v.id } });
  return ok({ deleted: true });
}

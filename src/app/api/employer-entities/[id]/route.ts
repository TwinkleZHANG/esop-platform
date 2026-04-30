import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

/**
 * DELETE /api/employer-entities/[id]
 * 删除前校验：被任何员工引用则拒绝。
 * 权限：与添加用工主体一致（employee.create：超管 + 授予管理员 + 审批管理员）。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const entity = await prisma.employerEntity.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!entity) return fail("用工主体不存在", 404);
  if (entity._count.users > 0) {
    return fail("该用工主体已被引用，无法删除");
  }

  await prisma.employerEntity.delete({ where: { id: entity.id } });
  return ok({ deleted: true });
}

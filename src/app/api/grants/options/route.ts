import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

/**
 * 创建授予弹窗用的下拉选项：仅已通过的计划、在职员工、启用的持股主体。
 */
export async function GET() {
  const guard = await requirePermission("grant.create");
  if (isErrorResponse(guard)) return guard;

  const [plans, employees, entities] = await Promise.all([
    prisma.plan.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        jurisdiction: true,
        poolSize: true,
      },
    }),
    prisma.user.findMany({
      // 创建授予时所有「在职」用户均可作为被授予人（含管理员角色）
      where: { employmentStatus: "在职" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, employeeId: true, department: true },
    }),
    prisma.holdingEntity.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, entityCode: true },
    }),
  ]);

  return ok({
    plans: plans.map((p) => ({ ...p, poolSize: p.poolSize.toFixed(0) })),
    employees,
    entities,
  });
}

import { GrantStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

export async function GET(
  _req: Request,
  { params }: { params: { employeeId: string } }
) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const user = await prisma.user.findUnique({
    where: { id: params.employeeId },
    select: {
      id: true,
      name: true,
      employeeId: true,
      department: true,
      email: true,
      employmentStatus: true,
      role: true,
    },
  });
  if (!user || user.role !== UserRole.EMPLOYEE) {
    return fail("员工不存在", 404);
  }

  const grants = await prisma.grant.findMany({
    where: {
      userId: user.id,
      status: { not: GrantStatus.DRAFT },
    },
    orderBy: { grantDate: "desc" },
    include: {
      plan: { select: { title: true, type: true } },
      holdingEntity: { select: { id: true, name: true } },
      vestingRecords: {
        orderBy: { vestingDate: "asc" },
        select: {
          id: true,
          vestingDate: true,
          quantity: true,
          status: true,
        },
      },
    },
  });

  return ok({
    user,
    grants: grants.map((g) => ({
      id: g.id,
      planTitle: g.plan.title,
      planType: g.plan.type,
      holdingEntity: g.holdingEntity,
      grantDate: g.grantDate,
      totalQuantity: g.totalQuantity.toFixed(0),
      operableShares: g.operableShares.toFixed(0),
      operableOptions: g.operableOptions.toFixed(0),
      status: g.status,
    })),
    vestingRecords: grants.flatMap((g) =>
      g.vestingRecords.map((v) => ({
        id: v.id,
        grantId: g.id,
        planTitle: g.plan.title,
        planType: g.plan.type,
        vestingDate: v.vestingDate,
        quantity: v.quantity.toFixed(0),
        status: v.status,
      }))
    ),
  });
}

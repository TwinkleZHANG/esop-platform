import { GrantStatus, Jurisdiction, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

const JURISDICTION = ["MAINLAND", "HONGKONG", "OVERSEAS"] as const;

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
  legalIdentity: z.enum(JURISDICTION).optional(),
  taxResidence: z.enum(JURISDICTION).optional(),
  employerEntityIds: z.array(z.string()).optional(),
  employmentStatus: z.enum(["在职", "离职"]).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      employerEntities: true,
      grants: {
        where: { status: { not: GrantStatus.DRAFT } },
        select: {
          id: true,
          totalQuantity: true,
          status: true,
          grantDate: true,
          plan: { select: { id: true, title: true, type: true } },
        },
        orderBy: { grantDate: "desc" },
      },
    },
  });
  if (!user) return fail("员工不存在", 404);

  return ok({
    id: user.id,
    name: user.name,
    employeeId: user.employeeId,
    email: user.email,
    department: user.department,
    legalIdentity: user.legalIdentity,
    taxResidence: user.taxResidence,
    employmentStatus: user.employmentStatus,
    employerEntities: user.employerEntities,
    grants: user.grants.map((g) => ({
      id: g.id,
      planTitle: g.plan.title,
      planType: g.plan.type,
      totalQuantity: g.totalQuantity.toString(),
      status: g.status,
      grantDate: g.grantDate,
    })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("employee.edit");
  if (isErrorResponse(guard)) return guard;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return fail("员工不存在", 404);

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const data: Prisma.UserUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.department !== undefined) data.department = d.department || null;
  if (d.legalIdentity !== undefined)
    data.legalIdentity = d.legalIdentity as Jurisdiction;
  if (d.taxResidence !== undefined)
    data.taxResidence = d.taxResidence as Jurisdiction;
  if (d.employmentStatus !== undefined)
    data.employmentStatus = d.employmentStatus;
  if (d.employerEntityIds !== undefined) {
    data.employerEntities = {
      set: d.employerEntityIds.map((id) => ({ id })),
    };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    include: { employerEntities: true },
  });

  return ok({
    id: updated.id,
    name: updated.name,
    employeeId: updated.employeeId,
    email: updated.email,
    department: updated.department,
    legalIdentity: updated.legalIdentity,
    taxResidence: updated.taxResidence,
    employmentStatus: updated.employmentStatus,
    employerEntities: updated.employerEntities,
  });
}

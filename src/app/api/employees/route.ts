import { GrantStatus, Jurisdiction, Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  paged,
  parseDateRange,
  parsePagination,
  requirePermission,
} from "@/lib/api-utils";
import { generateInitialPassword } from "@/lib/password-gen";

const JURISDICTION = ["MAINLAND", "HONGKONG", "OVERSEAS"] as const;

const createSchema = z.object({
  name: z.string().min(1, "员工姓名必填"),
  employeeId: z.string().min(1, "员工 ID 必填"),
  email: z.string().email("邮箱格式错误"),
  department: z.string().optional().nullable(),
  legalIdentity: z.enum(JURISDICTION),
  taxResidence: z.enum(JURISDICTION),
  employerEntityIds: z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status"); // "在职" | "离职" | "ALL"

  const where: Prisma.UserWhereInput = {
    role: UserRole.EMPLOYEE,
  };
  if (status === "在职" || status === "离职") {
    where.employmentStatus = status;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { employeeId: { contains: search, mode: "insensitive" } },
    ];
  }
  const range = parseDateRange(url.searchParams);
  if (range.gte || range.lte) where.createdAt = range;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        _count: {
          select: {
            grants: {
              where: { status: { not: GrantStatus.DRAFT } },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const enriched = items.map((u) => ({
    id: u.id,
    name: u.name,
    employeeId: u.employeeId,
    email: u.email,
    department: u.department,
    legalIdentity: u.legalIdentity,
    taxResidence: u.taxResidence,
    employmentStatus: u.employmentStatus,
    grantCount: u._count.grants,
  }));

  return ok(paged(enriched, total, pagination));
}

export async function POST(req: Request) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const duplicate = await prisma.user.findFirst({
    where: {
      OR: [{ email: d.email }, { employeeId: d.employeeId }],
    },
    select: { id: true, email: true, employeeId: true },
  });
  if (duplicate) {
    return fail(
      duplicate.email === d.email ? "邮箱已被使用" : "员工 ID 已被使用"
    );
  }

  const initialPassword = generateInitialPassword(8);
  const passwordHash = await bcrypt.hash(initialPassword, 10);

  const user = await prisma.user.create({
    data: {
      name: d.name,
      employeeId: d.employeeId,
      email: d.email,
      department: d.department || null,
      legalIdentity: d.legalIdentity as Jurisdiction,
      taxResidence: d.taxResidence as Jurisdiction,
      passwordHash,
      mustChangePassword: true,
      role: UserRole.EMPLOYEE,
      employmentStatus: "在职",
      employerEntities:
        d.employerEntityIds && d.employerEntityIds.length > 0
          ? { connect: d.employerEntityIds.map((id) => ({ id })) }
          : undefined,
    },
  });

  return ok({
    id: user.id,
    name: user.name,
    employeeId: user.employeeId,
    email: user.email,
    initialPassword, // 仅此处返回明文初始密码，交给管理员
  });
}

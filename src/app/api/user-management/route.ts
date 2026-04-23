import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  ok,
  paged,
  parseDateRange,
  parsePagination,
  requirePermission,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  const guard = await requirePermission("userManagement");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const role = url.searchParams.get("role"); // UserRole | ALL

  const where: Prisma.UserWhereInput = {};
  if (
    role === "SUPER_ADMIN" ||
    role === "GRANT_ADMIN" ||
    role === "APPROVAL_ADMIN" ||
    role === "EMPLOYEE"
  ) {
    where.role = role as UserRole;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
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
      select: {
        id: true,
        name: true,
        employeeId: true,
        email: true,
        role: true,
        employmentStatus: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return ok(paged(items, total, pagination));
}

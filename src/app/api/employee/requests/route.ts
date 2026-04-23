import {
  OperationRequestStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  paged,
  parseDateRange,
  parsePagination,
  requireSession,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;
  if (session.user.role !== UserRole.EMPLOYEE) return fail("仅员工可访问", 403);

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");

  const where: Prisma.OperationRequestWhereInput = {
    userId: session.user.id,
  };
  if (
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "REJECTED" ||
    status === "CLOSED"
  ) {
    where.status = status as OperationRequestStatus;
  }
  if (search) {
    where.grant = {
      plan: {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { id: { contains: search, mode: "insensitive" } },
        ],
      },
    };
  }
  const range = parseDateRange(url.searchParams);
  if (range.gte || range.lte) where.submitDate = range;

  const [items, total] = await Promise.all([
    prisma.operationRequest.findMany({
      where,
      orderBy: { submitDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        grant: {
          select: {
            id: true,
            plan: { select: { id: true, title: true, type: true } },
          },
        },
      },
    }),
    prisma.operationRequest.count({ where }),
  ]);

  return ok(
    paged(
      items.map((r) => ({
        id: r.id,
        planTitle: r.grant.plan.title,
        planType: r.grant.plan.type,
        requestType: r.requestType,
        requestTarget: r.requestTarget,
        quantity: r.quantity.toFixed(0),
        status: r.status,
        submitDate: r.submitDate,
        approveDate: r.approveDate,
        approverNotes: r.approverNotes,
      })),
      total,
      pagination
    )
  );
}

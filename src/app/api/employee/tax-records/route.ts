import {
  Prisma,
  TaxEventStatus,
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

  const where: Prisma.TaxEventWhereInput = { userId: session.user.id };
  if (
    status === "PENDING_PAYMENT" ||
    status === "RECEIPT_UPLOADED" ||
    status === "CONFIRMED"
  ) {
    where.status = status as TaxEventStatus;
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
  if (range.gte || range.lte) where.eventDate = range;

  const [items, total] = await Promise.all([
    prisma.taxEvent.findMany({
      where,
      orderBy: { eventDate: "desc" },
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
    prisma.taxEvent.count({ where }),
  ]);

  return ok(
    paged(
      items.map((t) => ({
        id: t.id,
        planTitle: t.grant.plan.title,
        planType: t.grant.plan.type,
        eventType: t.eventType,
        operationType: t.operationType,
        operationTarget: t.operationTarget,
        quantity: t.quantity.toFixed(0),
        eventDate: t.eventDate,
        fmvAtEvent: t.fmvAtEvent.toFixed(2),
        strikePrice: t.strikePrice.toFixed(2),
        status: t.status,
        receiptFiles: t.receiptFiles,
        employeeNotes: t.employeeNotes,
      })),
      total,
      pagination
    )
  );
}

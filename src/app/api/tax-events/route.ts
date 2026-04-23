import { Prisma, TaxEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  ok,
  paged,
  parsePagination,
  requirePermission,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  // 所有管理员可查看（列表用于审批管理员确认）；员工端通过独立端点在 Session 6 接入
  const guard = await requirePermission("taxEvent.export");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const where: Prisma.TaxEventWhereInput = {};
  if (
    status === "PENDING_PAYMENT" ||
    status === "RECEIPT_UPLOADED" ||
    status === "CONFIRMED"
  ) {
    where.status = status as TaxEventStatus;
  }
  if (search) {
    where.user = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ],
    };
  }
  if (fromStr || toStr) {
    const range: Prisma.DateTimeFilter = {};
    if (fromStr) {
      const dt = new Date(fromStr);
      if (!isNaN(dt.getTime())) range.gte = dt;
    }
    if (toStr) {
      const dt = new Date(toStr);
      if (!isNaN(dt.getTime())) {
        dt.setHours(23, 59, 59, 999);
        range.lte = dt;
      }
    }
    where.eventDate = range;
  }

  const [items, total] = await Promise.all([
    prisma.taxEvent.findMany({
      where,
      orderBy: { eventDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        user: { select: { id: true, name: true, employeeId: true } },
        grant: {
          select: { id: true, plan: { select: { title: true, type: true } } },
        },
      },
    }),
    prisma.taxEvent.count({ where }),
  ]);

  return ok(
    paged(
      items.map((t) => ({
        id: t.id,
        grantId: t.grantId,
        user: t.user,
        grant: t.grant,
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

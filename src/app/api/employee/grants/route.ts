import { GrantStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
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
  // 员工端 API：始终按 session.user.id 过滤，员工与管理员均可访问自己的数据

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");

  const where: Prisma.GrantWhereInput = {
    userId: session.user.id,
    status: { not: GrantStatus.DRAFT },
  };
  if (status && status !== "ALL") {
    where.status = status as GrantStatus;
  }
  if (search) {
    where.OR = [
      { plan: { title: { contains: search, mode: "insensitive" } } },
      { plan: { id: { contains: search, mode: "insensitive" } } },
    ];
  }
  const range = parseDateRange(url.searchParams);
  if (range.gte || range.lte) where.grantDate = range;

  const [items, total] = await Promise.all([
    prisma.grant.findMany({
      where,
      orderBy: { grantDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        plan: { select: { id: true, title: true, type: true } },
      },
    }),
    prisma.grant.count({ where }),
  ]);

  return ok(
    paged(
      items.map((g) => ({
        id: g.id,
        plan: g.plan,
        totalQuantity: g.totalQuantity.toFixed(0),
        strikePrice: g.strikePrice.toFixed(2),
        grantDate: g.grantDate,
        vestingStartDate: g.vestingStartDate,
        status: g.status,
        operableShares: g.operableShares.toFixed(0),
        operableOptions: g.operableOptions.toFixed(0),
        exerciseDeadline: g.exerciseDeadline,
        exerciseWindowDeadline: g.exerciseWindowDeadline,
      })),
      total,
      pagination
    )
  );
}

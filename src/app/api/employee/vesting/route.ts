import {
  GrantStatus,
  Prisma,
  VestingRecordStatus,
} from "@prisma/client";
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
  // 员工端 API：按 session.user.id 过滤，员工与管理员均可访问自己的数据

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");

  const where: Prisma.VestingRecordWhereInput = {
    grant: {
      userId: session.user.id,
      status: { not: GrantStatus.DRAFT },
    },
  };
  if (
    status === "PENDING" ||
    status === "VESTED" ||
    status === "PARTIALLY_SETTLED" ||
    status === "SETTLED" ||
    status === "CLOSED"
  ) {
    where.status = status as VestingRecordStatus;
  }
  if (search) {
    where.grant = {
      ...(where.grant as Prisma.GrantWhereInput),
      plan: {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { id: { contains: search, mode: "insensitive" } },
        ],
      },
    };
  }
  const range = parseDateRange(url.searchParams);
  if (range.gte || range.lte) where.vestingDate = range;

  const [items, total] = await Promise.all([
    prisma.vestingRecord.findMany({
      where,
      orderBy: { vestingDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        grant: {
          select: {
            id: true,
            operableShares: true,
            plan: { select: { id: true, title: true, type: true } },
          },
        },
      },
    }),
    prisma.vestingRecord.count({ where }),
  ]);

  return ok(
    paged(
      items.map((v) => ({
        id: v.id,
        grantId: v.grantId,
        planTitle: v.grant.plan.title,
        planType: v.grant.plan.type,
        vestingDate: v.vestingDate,
        quantity: v.quantity.toFixed(0),
        exercisableOptions: v.exercisableOptions.toFixed(0),
        grantOperableShares: v.grant.operableShares.toFixed(0),
        status: v.status,
      })),
      total,
      pagination
    )
  );
}

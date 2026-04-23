import { Prisma } from "@prisma/client";
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

const createSchema = z.object({
  valuationDate: z.string().min(1),
  fmv: z.union([z.string(), z.number()]),
  source: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const guard = await requirePermission("valuation.create");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const range = parseDateRange(url.searchParams);
  const where: Prisma.ValuationWhereInput = {};
  if (range.gte || range.lte) where.valuationDate = range;

  const [items, total] = await Promise.all([
    prisma.valuation.findMany({
      where,
      orderBy: { valuationDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.valuation.count({ where }),
  ]);

  return ok(
    paged(
      items.map((v) => ({ ...v, fmv: v.fmv.toFixed(2) })),
      total,
      pagination
    )
  );
}

export async function POST(req: Request) {
  const guard = await requirePermission("valuation.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const date = new Date(d.valuationDate);
  if (isNaN(date.getTime())) return fail("估值日期格式错误");

  // 港币精度：最多 2 位小数，向偶数舍入（ROUND_HALF_EVEN = 6）
  const fmv = new Prisma.Decimal(d.fmv).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  if (fmv.lte(0)) return fail("FMV 必须大于 0");

  const created = await prisma.valuation.create({
    data: {
      valuationDate: date,
      fmv,
      source: d.source || null,
      description: d.description || null,
    },
  });

  return ok({ ...created, fmv: created.fmv.toFixed(2) });
}

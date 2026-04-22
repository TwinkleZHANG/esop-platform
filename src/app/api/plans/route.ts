import { PlanStatus, PlanType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  paged,
  parsePagination,
  requirePermission,
} from "@/lib/api-utils";
import { computePlansGrantedQuantities } from "@/lib/plan-quantity";

const RSU_DELIVERY = ["SHARES", "LP_SHARES", "OFFSHORE_SPV"] as const;

const createPlanSchema = z
  .object({
    title: z.string().min(1, "计划标题必填"),
    type: z.enum(["RSU", "OPTION"]),
    jurisdiction: z.enum(["内地", "香港", "海外"]),
    deliveryMethods: z.array(z.enum(RSU_DELIVERY)).optional(),
    poolSize: z.union([z.string(), z.number()]),
    effectiveDate: z.string().min(1),
    boardResolutionId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (d) =>
      d.type === "OPTION" ||
      (Array.isArray(d.deliveryMethods) && d.deliveryMethods.length > 0),
    { message: "RSU 必须选择至少一种交割方式", path: ["deliveryMethods"] }
  );

export async function GET(req: Request) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const type = url.searchParams.get("type"); // "RSU" | "OPTION" | "ALL"

  const where: Prisma.PlanWhereInput = {};
  if (type === "RSU" || type === "OPTION") {
    where.type = type as PlanType;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { id: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.plan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.plan.count({ where }),
  ]);

  const granted = await computePlansGrantedQuantities(
    items.map((p) => ({ id: p.id, type: p.type }))
  );

  const enriched = items.map((p) => {
    const g = granted[p.id] ?? new Prisma.Decimal(0);
    return {
      ...p,
      poolSize: p.poolSize.toFixed(0),
      grantedQuantity: g.toFixed(0),
      remainingQuantity: new Prisma.Decimal(p.poolSize).sub(g).toFixed(0),
    };
  });

  return ok(paged(enriched, total, pagination));
}

export async function POST(req: Request) {
  const guard = await requirePermission("plan.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createPlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const deliveryMethod =
    d.type === "RSU"
      ? { methods: d.deliveryMethods }
      : { methods: ["OPTION_RIGHT"], label: "购买实股的权利" };

  const effectiveDate = new Date(d.effectiveDate);
  if (isNaN(effectiveDate.getTime())) return fail("生效日期格式错误");

  // 激励池规模为整数股数，强制 0 位小数
  const poolSize = new Prisma.Decimal(d.poolSize).toDecimalPlaces(
    0,
    Prisma.Decimal.ROUND_DOWN
  );
  if (poolSize.lte(0)) return fail("激励池规模必须为大于 0 的整数");

  const plan = await prisma.plan.create({
    data: {
      title: d.title,
      type: d.type as PlanType,
      jurisdiction: d.jurisdiction,
      deliveryMethod,
      poolSize,
      effectiveDate,
      boardResolutionId: d.boardResolutionId || null,
      notes: d.notes || null,
      status: PlanStatus.PENDING_APPROVAL,
    },
  });

  return ok({ ...plan, poolSize: plan.poolSize.toFixed(0) });
}

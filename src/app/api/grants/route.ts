import {
  GrantStatus,
  HoldingEntityStatus,
  PlanStatus,
  PlanType,
  Prisma,
} from "@prisma/client";
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
import { computePlanGrantedQuantity } from "@/lib/plan-quantity";

const createSchema = z.object({
  planId: z.string().min(1, "计划必选"),
  userId: z.string().min(1, "员工必选"),
  holdingEntityId: z.string().optional().nullable(),
  grantDate: z.string().min(1, "授予日期必填"),
  vestingStartDate: z.string().optional().nullable(),
  totalQuantity: z.union([z.string(), z.number()]),
  strikePrice: z.union([z.string(), z.number()]).optional(),
  agreementId: z.string().optional().nullable(),
  vestingYears: z.number().int().positive(),
  cliffMonths: z.number().int().min(0),
  vestingFrequency: z.enum(["MONTHLY", "YEARLY"]),
});

export async function GET(req: Request) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");

  const hasPending = url.searchParams.get("hasPending") === "1";

  const where: Prisma.GrantWhereInput = {};
  if (status && status !== "ALL") {
    where.status = status as GrantStatus;
  }
  if (search) {
    where.OR = [
      { plan: { title: { contains: search, mode: "insensitive" } } },
      { plan: { id: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (hasPending) {
    where.operationRequests = { some: { status: "PENDING" } };
  }

  const [items, total] = await Promise.all([
    prisma.grant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        plan: { select: { id: true, title: true, type: true } },
        user: { select: { id: true, name: true, employeeId: true } },
        holdingEntity: { select: { id: true, name: true } },
        _count: {
          select: {
            operationRequests: { where: { status: "PENDING" } },
          },
        },
      },
    }),
    prisma.grant.count({ where }),
  ]);

  const enriched = items.map((g) => ({
    id: g.id,
    plan: g.plan,
    user: g.user,
    holdingEntity: g.holdingEntity,
    totalQuantity: g.totalQuantity.toFixed(0),
    strikePrice: g.strikePrice.toFixed(2),
    grantDate: g.grantDate,
    status: g.status,
    operableShares: g.operableShares.toFixed(0),
    operableOptions: g.operableOptions.toFixed(0),
    exerciseWindowDeadline: g.exerciseWindowDeadline,
    exerciseWindowDays: g.exerciseWindowDays,
    pendingRequestCount: g._count.operationRequests,
  }));

  return ok(paged(enriched, total, pagination));
}

export async function POST(req: Request) {
  const guard = await requirePermission("grant.create");
  if (isErrorResponse(guard)) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  // 前置校验（PRD 8.3）
  const plan = await prisma.plan.findUnique({ where: { id: d.planId } });
  if (!plan) return fail("计划不存在");
  if (plan.status !== PlanStatus.APPROVED) {
    return fail("仅「已通过」的计划可被引用");
  }

  const user = await prisma.user.findUnique({ where: { id: d.userId } });
  if (!user) return fail("员工不存在");
  if (user.employmentStatus !== "在职") {
    return fail("仅「在职」员工可被授予");
  }

  if (d.holdingEntityId) {
    const entity = await prisma.holdingEntity.findUnique({
      where: { id: d.holdingEntityId },
    });
    if (!entity) return fail("持股主体不存在");
    if (entity.status !== HoldingEntityStatus.ACTIVE) {
      return fail("仅「启用」的持股主体可被引用");
    }
  }

  // 剩余额度校验（PRD 4.1 公式）
  const totalQuantity = new Prisma.Decimal(d.totalQuantity).toDecimalPlaces(
    0,
    Prisma.Decimal.ROUND_DOWN
  );
  if (totalQuantity.lte(0)) {
    return fail("授予数量必须为大于 0 的整数");
  }

  const granted = await computePlanGrantedQuantity(plan.id, plan.type);
  const remaining = plan.poolSize.sub(granted);
  if (totalQuantity.gt(remaining)) {
    return fail(`该计划剩余额度不足，当前剩余 ${remaining.toFixed(0)}`);
  }

  // RSU 行权价固定为 0；Option 必填且 > 0
  let strikePrice: Prisma.Decimal;
  if (plan.type === PlanType.RSU) {
    strikePrice = new Prisma.Decimal(0);
  } else {
    if (d.strikePrice === undefined || d.strikePrice === null || d.strikePrice === "") {
      return fail("Option 必须填写行权价");
    }
    strikePrice = new Prisma.Decimal(d.strikePrice).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_EVEN
    );
    if (strikePrice.lte(0)) return fail("Option 的行权价必须大于 0");
  }

  const grantDate = new Date(d.grantDate);
  if (isNaN(grantDate.getTime())) return fail("授予日期格式错误");
  const vestingStartDate = d.vestingStartDate
    ? new Date(d.vestingStartDate)
    : grantDate;
  if (isNaN(vestingStartDate.getTime())) return fail("授予计划开始日期格式错误");

  // Draft 阶段不生成归属记录（PRD 3.3 + 4.5）
  const grant = await prisma.grant.create({
    data: {
      planId: plan.id,
      userId: user.id,
      holdingEntityId: d.holdingEntityId || null,
      grantDate,
      vestingStartDate,
      totalQuantity,
      strikePrice,
      agreementId: d.agreementId || null,
      vestingYears: d.vestingYears,
      cliffMonths: d.cliffMonths,
      vestingFrequency: d.vestingFrequency,
      status: GrantStatus.DRAFT,
    },
  });

  return ok({
    id: grant.id,
    status: grant.status,
  });
}

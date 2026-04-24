import { PlanStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  decimalLike,
  fail,
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";
import { computePlanGrantedQuantity } from "@/lib/plan-quantity";

const RSU_DELIVERY = ["SHARES", "LP_SHARES", "OFFSHORE_SPV"] as const;

const updatePlanSchema = z.object({
  title: z.string().min(1).optional(),
  jurisdiction: z.enum(["内地", "香港", "海外"]).optional(),
  deliveryMethods: z.array(z.enum(RSU_DELIVERY)).optional(),
  poolSize: decimalLike.optional(),
  effectiveDate: z.string().optional(),
  boardResolutionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) return fail("计划不存在", 404);

  const grantedQty = await computePlanGrantedQuantity(plan.id, plan.type);

  return ok({
    ...plan,
    poolSize: plan.poolSize.toFixed(0),
    grantedQuantity: grantedQty.toFixed(0),
    remainingQuantity: new Prisma.Decimal(plan.poolSize)
      .sub(grantedQty)
      .toFixed(0),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("plan.create");
  if (isErrorResponse(guard)) return guard;

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) return fail("计划不存在", 404);
  if (plan.status !== PlanStatus.PENDING_APPROVAL) {
    return fail("仅审批中的计划可编辑");
  }

  const parsed = updatePlanSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const data: Prisma.PlanUpdateInput = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.jurisdiction !== undefined) data.jurisdiction = d.jurisdiction;
  if (d.poolSize !== undefined) {
    const ps = new Prisma.Decimal(d.poolSize).toDecimalPlaces(
      0,
      Prisma.Decimal.ROUND_DOWN
    );
    if (ps.lte(0)) return fail("激励池规模必须为大于 0 的整数");
    data.poolSize = ps;
  }
  if (d.effectiveDate !== undefined) {
    const dt = new Date(d.effectiveDate);
    if (isNaN(dt.getTime())) return fail("生效日期格式错误");
    data.effectiveDate = dt;
  }
  if (d.boardResolutionId !== undefined)
    data.boardResolutionId = d.boardResolutionId || null;
  if (d.notes !== undefined) data.notes = d.notes || null;
  if (d.deliveryMethods !== undefined) {
    if (plan.type === "RSU") {
      if (d.deliveryMethods.length === 0) {
        return fail("RSU 必须选择至少一种交割方式");
      }
      data.deliveryMethod = { methods: d.deliveryMethods };
    }
    // Option 的 deliveryMethod 不可改，忽略
  }

  const updated = await prisma.plan.update({
    where: { id: plan.id },
    data,
  });

  return ok({ ...updated, poolSize: updated.poolSize.toFixed(0) });
}

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // 审批通过
  const guard = await requirePermission("plan.approve");
  if (isErrorResponse(guard)) return guard;

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) return fail("计划不存在", 404);
  if (plan.status !== PlanStatus.PENDING_APPROVAL) {
    return fail("该计划已审批通过");
  }

  const updated = await prisma.plan.update({
    where: { id: plan.id },
    data: { status: PlanStatus.APPROVED },
  });

  return ok({ ...updated, poolSize: updated.poolSize.toFixed(0) });
}

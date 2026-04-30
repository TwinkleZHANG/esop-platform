import {
  GrantStatus,
  PlanType,
  Prisma,
  VestingRecordStatus,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  decimalLike,
  fail,
  isErrorResponse,
  ok,
  requirePermission,
  requireSession,
} from "@/lib/api-utils";
import { generateVestingSchedule } from "@/lib/vesting";
import { validateGrantTransition } from "@/lib/state-machine";
import { createStatusLog } from "@/lib/audit";
import { addYearsEndOfDay } from "@/lib/exercise-period";

const updateSchema = z.object({
  holdingEntityId: z.string().nullable().optional(),
  grantDate: z.string().optional(),
  vestingStartDate: z.string().nullable().optional(),
  totalQuantity: decimalLike.optional(),
  strikePrice: decimalLike.optional(),
  agreementId: z.string().nullable().optional(),
  vestingYears: z.number().int().positive().optional(),
  cliffMonths: z.number().int().min(0).optional(),
  vestingFrequency: z.enum(["MONTHLY", "YEARLY"]).optional(),
  exercisePeriodYears: z.number().int().positive().optional().nullable(),
});

const patchSchema = z.object({
  to: z.enum([
    "GRANTED",
    "CLOSING",
    "CLOSED",
  ]),
  agreementId: z.string().optional().nullable(),
  closedReason: z.string().optional().nullable(),
  exerciseWindowDays: z.number().int().min(0).max(3650).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const grant = await prisma.grant.findUnique({
    where: { id: params.id },
    include: {
      plan: { select: { id: true, title: true, type: true, jurisdiction: true } },
      user: {
        select: { id: true, name: true, employeeId: true, email: true },
      },
      holdingEntity: { select: { id: true, name: true } },
      vestingRecords: { orderBy: { vestingDate: "asc" } },
      taxEvents: { orderBy: { eventDate: "desc" } },
      operationRequests: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { submitDate: "desc" },
      },
      statusLogs: { orderBy: { timestamp: "desc" } },
    },
  });
  if (!grant) return fail("授予不存在", 404);

  return ok({
    ...grant,
    totalQuantity: grant.totalQuantity.toFixed(0),
    strikePrice: grant.strikePrice.toFixed(2),
    operableShares: grant.operableShares.toFixed(0),
    operableOptions: grant.operableOptions.toFixed(0),
    vestingRecords: grant.vestingRecords.map((v) => ({
      ...v,
      quantity: v.quantity.toFixed(0),
      exercisableOptions: v.exercisableOptions.toFixed(0),
    })),
    taxEvents: grant.taxEvents.map((t) => ({
      ...t,
      quantity: t.quantity.toFixed(0),
      fmvAtEvent: t.fmvAtEvent.toFixed(2),
      strikePrice: t.strikePrice.toFixed(2),
    })),
    operationRequests: grant.operationRequests.map((r) => ({
      ...r,
      quantity: r.quantity.toFixed(0),
    })),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // 与创建授予同权限：超管 + 授予管理员
  const guard = await requirePermission("grant.create");
  if (isErrorResponse(guard)) return guard;

  const grant = await prisma.grant.findUnique({ where: { id: params.id } });
  if (!grant) return fail("授予不存在", 404);
  if (grant.status !== GrantStatus.DRAFT) {
    return fail("仅 Draft 状态可删除");
  }
  // Draft 授予无归属/税务/申请，直接删除即可。
  // 删除后已授予数量自动减少（plan-quantity 仅汇总仍存在的 Grant）。
  await prisma.grant.delete({ where: { id: grant.id } });
  return ok({ deleted: true });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("grant.create");
  if (isErrorResponse(guard)) return guard;

  const grant = await prisma.grant.findUnique({ where: { id: params.id } });
  if (!grant) return fail("授予不存在", 404);
  if (grant.status !== GrantStatus.DRAFT) {
    return fail("仅 Draft 状态可编辑");
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const data: Prisma.GrantUpdateInput = {};
  if (d.holdingEntityId !== undefined) {
    if (d.holdingEntityId) {
      const entity = await prisma.holdingEntity.findUnique({
        where: { id: d.holdingEntityId },
      });
      if (!entity || entity.status !== "ACTIVE") {
        return fail("持股主体不存在或未启用");
      }
      data.holdingEntity = { connect: { id: d.holdingEntityId } };
    } else {
      data.holdingEntity = { disconnect: true };
    }
  }
  if (d.grantDate !== undefined) {
    const dt = new Date(d.grantDate);
    if (isNaN(dt.getTime())) return fail("授予日期格式错误");
    data.grantDate = dt;
  }
  if (d.vestingStartDate !== undefined) {
    if (d.vestingStartDate) {
      const dt = new Date(d.vestingStartDate);
      if (isNaN(dt.getTime())) return fail("授予计划开始日期格式错误");
      data.vestingStartDate = dt;
    } else {
      data.vestingStartDate = null;
    }
  }
  if (d.totalQuantity !== undefined) {
    const q = new Prisma.Decimal(d.totalQuantity).toDecimalPlaces(
      0,
      Prisma.Decimal.ROUND_DOWN
    );
    if (q.lte(0)) return fail("授予数量必须为大于 0 的整数");
    data.totalQuantity = q;
  }
  if (d.strikePrice !== undefined) {
    const plan = await prisma.plan.findUnique({
      where: { id: grant.planId },
    });
    if (plan?.type === PlanType.RSU) {
      data.strikePrice = new Prisma.Decimal(0);
    } else {
      const sp = new Prisma.Decimal(d.strikePrice).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_EVEN
      );
      if (sp.lte(0)) return fail("Option 行权价必须大于 0");
      data.strikePrice = sp;
    }
  }
  if (d.agreementId !== undefined) data.agreementId = d.agreementId || null;
  if (d.vestingYears !== undefined) data.vestingYears = d.vestingYears;
  if (d.cliffMonths !== undefined) data.cliffMonths = d.cliffMonths;
  if (d.vestingFrequency !== undefined)
    data.vestingFrequency = d.vestingFrequency;

  // Option 行权期：editable in Draft；如果传了或更改了 vestingYears/vestingStartDate，重算 exerciseDeadline
  const planForGrant = await prisma.plan.findUnique({
    where: { id: grant.planId },
    select: { type: true },
  });
  if (planForGrant?.type === PlanType.OPTION) {
    const finalVestingYears = d.vestingYears ?? grant.vestingYears;
    const finalExercisePeriodYears =
      d.exercisePeriodYears !== undefined && d.exercisePeriodYears !== null
        ? d.exercisePeriodYears
        : grant.exercisePeriodYears;
    if (finalExercisePeriodYears == null) {
      return fail("Option 必须填写行权期（年）");
    }
    if (finalExercisePeriodYears <= finalVestingYears) {
      return fail("行权期必须大于归属年限");
    }
    // 计算基准日：以编辑后的 vestingStartDate 优先，否则用 grant 当前值，再退到 grantDate
    const finalVestingStartDate =
      d.vestingStartDate !== undefined
        ? d.vestingStartDate
          ? new Date(d.vestingStartDate)
          : null
        : grant.vestingStartDate;
    const finalGrantDate =
      d.grantDate !== undefined ? new Date(d.grantDate) : grant.grantDate;
    const base = finalVestingStartDate ?? finalGrantDate;
    data.exercisePeriodYears = finalExercisePeriodYears;
    data.exerciseDeadline = addYearsEndOfDay(base, finalExercisePeriodYears);
  }

  const updated = await prisma.grant.update({
    where: { id: grant.id },
    data,
  });
  return ok({ id: updated.id });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const grant = await prisma.grant.findUnique({
    where: { id: params.id },
    include: { plan: { select: { type: true } } },
  });
  if (!grant) return fail("授予不存在", 404);

  const targetStatus = d.to as GrantStatus;

  // 权限：Draft → Granted 是审批管理员（grant.advance）；关闭是审批管理员（grant.close）
  const requiredPerm =
    targetStatus === GrantStatus.GRANTED ? "grant.advance" : "grant.close";
  const { hasPermission } = await import("@/lib/permissions");
  if (!hasPermission(session.user.role, requiredPerm)) {
    return fail("无权限", 403);
  }

  // 状态流转校验
  if (!validateGrantTransition(grant.status, targetStatus, grant.plan.type)) {
    return fail(
      `不允许从 ${grant.status} 流转到 ${targetStatus}（${grant.plan.type}）`
    );
  }

  // Draft → Granted：补协议 ID + 生成归属记录
  if (targetStatus === GrantStatus.GRANTED) {
    // Maker-Checker：不能审批自己的授予
    if (grant.userId === session.user.id) {
      return fail("不能审批自己的授予", 403);
    }
    const finalAgreementId = d.agreementId ?? grant.agreementId;
    if (!finalAgreementId || !finalAgreementId.trim()) {
      return fail("进入 Granted 状态前必须填写协议 ID");
    }

    const schedule = generateVestingSchedule({
      totalQuantity: grant.totalQuantity,
      vestingStartDate: grant.vestingStartDate ?? grant.grantDate,
      vestingYears: grant.vestingYears,
      cliffMonths: grant.cliffMonths,
      vestingFrequency: grant.vestingFrequency,
    });

    await prisma.$transaction(async (tx) => {
      await tx.grant.update({
        where: { id: grant.id },
        data: { agreementId: finalAgreementId, status: GrantStatus.GRANTED },
      });
      await tx.vestingRecord.createMany({
        data: schedule.map((s) => ({
          grantId: grant.id,
          vestingDate: s.vestingDate,
          quantity: s.quantity,
          status: VestingRecordStatus.PENDING,
        })),
      });
      await createStatusLog(
        grant.id,
        grant.status,
        GrantStatus.GRANTED,
        session.user.name ?? session.user.email ?? "系统",
        null,
        tx
      );
    });

    return ok({ id: grant.id, status: GrantStatus.GRANTED });
  }

  // Closing / Closed
  if (
    targetStatus === GrantStatus.CLOSING ||
    targetStatus === GrantStatus.CLOSED
  ) {
    if (!d.closedReason || !d.closedReason.trim()) {
      return fail("关闭原因必填");
    }

    if (targetStatus === GrantStatus.CLOSING) {
      // 仅 Option 且 operableOptions > 0
      if (grant.plan.type !== PlanType.OPTION) {
        return fail("仅 Option 且有未行权期权时可进入 Closing");
      }
      if (grant.operableOptions.lte(0)) {
        return fail("可操作期权为 0，应直接 Closed");
      }
      // 正常关闭不设窗口期：员工继续按原 exerciseDeadline 行权
      // 离职关闭走 /api/employees/[id] 级联，会传 exerciseWindowDays
    }

    await prisma.$transaction(async (tx) => {
      // Pending 归属记录 → Closed
      await tx.vestingRecord.updateMany({
        where: {
          grantId: grant.id,
          status: VestingRecordStatus.PENDING,
        },
        data: { status: VestingRecordStatus.CLOSED },
      });

      await tx.grant.update({
        where: { id: grant.id },
        data: {
          status: targetStatus,
          closedReason: d.closedReason,
          // 手动关闭不写 exerciseWindowDeadline / exerciseWindowDays
        },
      });

      await createStatusLog(
        grant.id,
        grant.status,
        targetStatus,
        session.user.name ?? session.user.email ?? "系统",
        d.closedReason,
        tx
      );
    });

    return ok({ id: grant.id, status: targetStatus });
  }

  return fail("不支持的状态变更");
}


import {
  GrantStatus,
  Jurisdiction,
  OperationRequestStatus,
  PlanType,
  Prisma,
  VestingRecordStatus,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requirePermission,
  requireSession,
} from "@/lib/api-utils";
import { createStatusLog } from "@/lib/audit";

const JURISDICTION = ["MAINLAND", "HONGKONG", "OVERSEAS"] as const;

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
  legalIdentity: z.enum(JURISDICTION).optional(),
  taxResidence: z.enum(JURISDICTION).optional(),
  employerEntityIds: z.array(z.string()).optional(),
  employmentStatus: z.enum(["在职", "离职"]).optional(),
  // 置为「离职」时必填：关闭原因 + 行权窗口期（0/30/90/365，用于 Option Grant 的 Closing）
  offboardReason: z.string().optional(),
  exerciseWindowDays: z
    .union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)])
    .optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePermission("employee.create");
  if (isErrorResponse(guard)) return guard;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      employerEntities: true,
      grants: {
        where: { status: { not: GrantStatus.DRAFT } },
        select: {
          id: true,
          totalQuantity: true,
          status: true,
          grantDate: true,
          plan: { select: { id: true, title: true, type: true } },
        },
        orderBy: { grantDate: "desc" },
      },
    },
  });
  if (!user) return fail("员工不存在", 404);

  return ok({
    id: user.id,
    name: user.name,
    employeeId: user.employeeId,
    email: user.email,
    department: user.department,
    legalIdentity: user.legalIdentity,
    taxResidence: user.taxResidence,
    employmentStatus: user.employmentStatus,
    employerEntities: user.employerEntities,
    grants: user.grants.map((g) => ({
      id: g.id,
      planTitle: g.plan.title,
      planType: g.plan.type,
      totalQuantity: g.totalQuantity.toString(),
      status: g.status,
      grantDate: g.grantDate,
    })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;
  const permCheck = await requirePermission("employee.edit");
  if (isErrorResponse(permCheck)) return permCheck;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return fail("员工不存在", 404);

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const isOffboardingTransition =
    d.employmentStatus === "离职" && user.employmentStatus !== "离职";

  // 离职级联前置校验（PRD 8.2 / 4.2）
  if (isOffboardingTransition) {
    // PRD 要求设为离职时统一填写关闭原因 + 行权窗口期，附到所有被关闭 Grant 上
    if (!d.offboardReason || !d.offboardReason.trim()) {
      return fail("设为离职需填写关闭原因");
    }
    if (d.exerciseWindowDays === undefined) {
      return fail("设为离职需选择行权窗口期（0/30/90/365）");
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.department !== undefined) data.department = d.department || null;
  if (d.legalIdentity !== undefined)
    data.legalIdentity = d.legalIdentity as Jurisdiction;
  if (d.taxResidence !== undefined)
    data.taxResidence = d.taxResidence as Jurisdiction;
  if (d.employmentStatus !== undefined)
    data.employmentStatus = d.employmentStatus;
  if (d.employerEntityIds !== undefined) {
    data.employerEntities = {
      set: d.employerEntityIds.map((id) => ({ id })),
    };
  }

  const operator = session.user.name ?? session.user.email ?? "系统";

  // 离职级联（PRD 8.2）：
  // ① 所有待审批申请 → 已关闭
  // ② RSU 非 All Settled → Closed
  // ③ Option 非 All Settled → operableOptions>0 ? Closing : Closed
  // ④ 统一附上关闭原因与窗口期
  const offboardSummary = {
    closedGrants: 0,
    closingGrants: 0,
    closedRequests: 0,
  };

  if (isOffboardingTransition) {
    const grants = await prisma.grant.findMany({
      where: {
        userId: user.id,
        status: { notIn: [GrantStatus.ALL_SETTLED, GrantStatus.CLOSED] },
      },
      include: { plan: { select: { type: true } } },
    });

    await prisma.$transaction(async (tx) => {
      // 用户基本信息
      await tx.user.update({ where: { id: user.id }, data });

      // ① 所有 PENDING 申请 → CLOSED（员工所有 Grant 范围）
      const closedReqs = await tx.operationRequest.updateMany({
        where: {
          userId: user.id,
          status: OperationRequestStatus.PENDING,
        },
        data: { status: OperationRequestStatus.CLOSED },
      });
      offboardSummary.closedRequests = closedReqs.count;

      for (const g of grants) {
        const isOption = g.plan.type === PlanType.OPTION;
        const goingToClosing =
          isOption &&
          g.status !== GrantStatus.CLOSING &&
          g.operableOptions.gt(0);
        const target = goingToClosing
          ? GrantStatus.CLOSING
          : GrantStatus.CLOSED;

        // PENDING 归属记录一律变 CLOSED
        await tx.vestingRecord.updateMany({
          where: {
            grantId: g.id,
            status: VestingRecordStatus.PENDING,
          },
          data: { status: VestingRecordStatus.CLOSED },
        });

        const deadline = goingToClosing
          ? addDays(new Date(), d.exerciseWindowDays!)
          : null;

        await tx.grant.update({
          where: { id: g.id },
          data: {
            status: target,
            closedReason: d.offboardReason!,
            exerciseWindowDeadline: deadline,
            exerciseWindowDays: goingToClosing
              ? d.exerciseWindowDays ?? null
              : null,
          },
        });

        await createStatusLog(
          g.id,
          g.status,
          target,
          operator,
          `员工离职：${d.offboardReason}`,
          tx
        );

        if (target === GrantStatus.CLOSING) offboardSummary.closingGrants += 1;
        else offboardSummary.closedGrants += 1;
      }
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { employerEntities: true },
    });
    return ok({
      id: updated.id,
      name: updated.name,
      employeeId: updated.employeeId,
      email: updated.email,
      department: updated.department,
      legalIdentity: updated.legalIdentity,
      taxResidence: updated.taxResidence,
      employmentStatus: updated.employmentStatus,
      employerEntities: updated.employerEntities,
      offboardSummary,
    });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    include: { employerEntities: true },
  });

  return ok({
    id: updated.id,
    name: updated.name,
    employeeId: updated.employeeId,
    email: updated.email,
    department: updated.department,
    legalIdentity: updated.legalIdentity,
    taxResidence: updated.taxResidence,
    employmentStatus: updated.employmentStatus,
    employerEntities: updated.employerEntities,
  });
}

/** 与 /api/grants/[id] 保持一致的窗口期计算：到期日当天 23:59:59（PRD 10） */
function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

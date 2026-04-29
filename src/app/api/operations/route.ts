import {
  OperationRequestStatus,
  OperationRequestType,
  OperationTarget,
  PlanType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  decimalLike,
  fail,
  isErrorResponse,
  ok,
  paged,
  parsePagination,
  requireSession,
} from "@/lib/api-utils";

const createSchema = z.object({
  grantId: z.string().min(1),
  requestType: z.enum(["EXERCISE", "TRANSFER", "SELL", "BUYBACK", "REDEEM"]),
  requestTarget: z.enum(["SHARES", "OPTIONS"]).optional(),
  quantity: decimalLike,
});

/**
 * 对（股权类型 × 操作目标 × 操作类型）的合法组合做校验，返回消耗的字段名。
 * 参考 PRD 3.6。
 */
function resolveOperation(
  planType: PlanType,
  requestType: OperationRequestType,
  requestTarget: OperationTarget | null
):
  | { ok: true; consumes: "operableShares" | "operableOptions"; target: OperationTarget }
  | { ok: false; error: string } {
  if (planType === PlanType.RSU) {
    if (requestType === OperationRequestType.EXERCISE) {
      return { ok: false, error: "RSU 不支持行权" };
    }
    // RSU 全部针对实股
    return { ok: true, consumes: "operableShares", target: OperationTarget.SHARES };
  }

  // Option
  if (!requestTarget) {
    return { ok: false, error: "Option 申请必须指定操作目标（实股/期权）" };
  }
  if (requestTarget === OperationTarget.OPTIONS) {
    // 允许：行权 / 转让 / 回购 / 兑现，不允许售出（期权不能直接卖）
    if (requestType === OperationRequestType.SELL) {
      return { ok: false, error: "期权不支持售出，请先行权" };
    }
    return { ok: true, consumes: "operableOptions", target: requestTarget };
  }
  // requestTarget === SHARES（已行权实股）
  if (requestType === OperationRequestType.EXERCISE) {
    return { ok: false, error: "已行权实股不支持再次行权" };
  }
  return { ok: true, consumes: "operableShares", target: requestTarget };
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams);
  const status = url.searchParams.get("status");
  const grantId = url.searchParams.get("grantId");

  const where: Prisma.OperationRequestWhereInput = {};
  // 员工只能看自己的，管理员可看全部
  if (session.user.role === UserRole.EMPLOYEE) {
    where.userId = session.user.id;
  }
  if (
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "REJECTED" ||
    status === "CLOSED"
  ) {
    where.status = status as OperationRequestStatus;
  }
  if (grantId) where.grantId = grantId;

  const [items, total] = await Promise.all([
    prisma.operationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        grant: {
          select: {
            id: true,
            plan: { select: { id: true, title: true, type: true } },
          },
        },
        user: { select: { id: true, name: true, employeeId: true } },
      },
    }),
    prisma.operationRequest.count({ where }),
  ]);

  return ok(
    paged(
      items.map((r) => ({
        id: r.id,
        grantId: r.grantId,
        grant: r.grant,
        user: r.user,
        requestType: r.requestType,
        requestTarget: r.requestTarget,
        quantity: r.quantity.toFixed(0),
        status: r.status,
        submitDate: r.submitDate,
        approveDate: r.approveDate,
        approverNotes: r.approverNotes,
      })),
      total,
      pagination
    )
  );
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  // 任意登录用户均可对自己的 Grant 提交申请；管理员切到员工视图时也走此路径。
  // 通过 grant.userId === session.user.id 校验，杜绝越权（见下方）。
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "参数错误");
  }
  const d = parsed.data;

  const grant = await prisma.grant.findUnique({
    where: { id: d.grantId },
    include: { plan: { select: { type: true } } },
  });
  if (!grant) return fail("授予不存在");
  if (grant.userId !== session.user.id) {
    return fail("无权操作他人的授予", 403);
  }

  const target =
    d.requestTarget === undefined ? null : (d.requestTarget as OperationTarget);
  const resolved = resolveOperation(
    grant.plan.type,
    d.requestType as OperationRequestType,
    target
  );
  if (!resolved.ok) return fail(resolved.error);

  const quantity = new Prisma.Decimal(d.quantity).toDecimalPlaces(
    0,
    Prisma.Decimal.ROUND_DOWN
  );
  if (quantity.lte(0)) return fail("申请数量必须为大于 0 的整数");

  const available =
    resolved.consumes === "operableShares"
      ? grant.operableShares
      : grant.operableOptions;
  if (quantity.gt(available)) {
    return fail(
      `申请数量超过可用额度，当前可用 ${available.toFixed(0)}`
    );
  }

  // 行权期 / 关闭窗口期截止校验（仅消耗 operableOptions 的申请）
  // 实际截止日 = min(exerciseDeadline, exerciseWindowDeadline)，取已设置的较早者。
  if (resolved.consumes === "operableOptions") {
    const now = new Date();
    const deadlines: Date[] = [];
    if (grant.exerciseDeadline) deadlines.push(grant.exerciseDeadline);
    if (grant.exerciseWindowDeadline)
      deadlines.push(grant.exerciseWindowDeadline);
    if (deadlines.length > 0) {
      const effective = deadlines.reduce((a, b) => (a < b ? a : b));
      if (now > effective) {
        return fail("行权期已到期，无法提交行权申请");
      }
    }
  }

  const created = await prisma.operationRequest.create({
    data: {
      grantId: grant.id,
      userId: session.user.id,
      requestType: d.requestType as OperationRequestType,
      requestTarget: resolved.target,
      quantity,
      status: OperationRequestStatus.PENDING,
    },
  });

  return ok({
    id: created.id,
    status: created.status,
    quantity: created.quantity.toFixed(0),
  });
}

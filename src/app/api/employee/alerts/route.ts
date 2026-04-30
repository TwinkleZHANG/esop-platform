import { GrantStatus, PlanType, TaxEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requireSession } from "@/lib/api-utils";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  // 员工端提醒：按 session.user.id 过滤；管理员切到员工视图时也走同一份数据
  const [user, closing, exerciseScan, pendingPaymentCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { employmentStatus: true },
    }),
    prisma.grant.findMany({
      where: {
        userId: session.user.id,
        status: GrantStatus.CLOSING,
        // operableOptions = 0 时提醒立即消失（员工已全部行权，不必等 cron 转 Closed）
        operableOptions: { gt: 0 },
      },
      select: {
        id: true,
        operableOptions: true,
        exerciseWindowDeadline: true,
        exerciseDeadline: true,
        plan: { select: { title: true } },
      },
      orderBy: [
        { exerciseWindowDeadline: "asc" },
        { exerciseDeadline: "asc" },
      ],
    }),
    // 行权期提醒：非 Closing 的非终态 Option Grant，operableOptions > 0
    prisma.grant.findMany({
      where: {
        userId: session.user.id,
        plan: { type: PlanType.OPTION },
        status: {
          in: [
            GrantStatus.GRANTED,
            GrantStatus.VESTING,
            GrantStatus.FULLY_VESTED,
            GrantStatus.STILL_EXERCISABLE,
          ],
        },
        operableOptions: { gt: 0 },
        exerciseDeadline: { not: null },
      },
      select: {
        id: true,
        operableOptions: true,
        exerciseDeadline: true,
        exerciseWindowDeadline: true,
        plan: { select: { title: true } },
      },
      orderBy: { exerciseDeadline: "asc" },
    }),
    prisma.taxEvent.count({
      where: {
        userId: session.user.id,
        status: TaxEventStatus.PENDING_PAYMENT,
      },
    }),
  ]);

  // 按本地天数差计算：同日 0、明日 1、昨日 -1（前端基于此判断「今日是最后行权日」/「已过期」）
  const today = new Date();
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const grants = closing
    .map((g) => {
      // 离职 Closing：exerciseWindowDeadline 严格早于 exerciseDeadline（窗口期使截止日提前）
      // 正常 Closing：exerciseWindowDeadline 为 null（沿用原 exerciseDeadline），
      //   或与 exerciseDeadline 相等（离职窗口刚好等于 exerciseDeadline）
      const isOffboardingClose =
        g.exerciseWindowDeadline !== null &&
        (g.exerciseDeadline === null ||
          g.exerciseWindowDeadline < g.exerciseDeadline);
      const deadline = g.exerciseWindowDeadline ?? g.exerciseDeadline;
      if (!deadline) return null;
      const dl = new Date(deadline);
      const dlMidnight = new Date(
        dl.getFullYear(),
        dl.getMonth(),
        dl.getDate()
      ).getTime();
      const daysRemaining = Math.round(
        (dlMidnight - todayMidnight) / (24 * 60 * 60 * 1000)
      );
      // 正常 Closing：与普通行权期提醒一致，仅当距截止日 ≤ 90 天才显示
      // 离职 Closing：窗口期通常很短，立即显示
      if (!isOffboardingClose) {
        const within90 =
          dl.getTime() - Date.now() <= NINETY_DAYS_MS;
        if (!within90) return null;
      }
      return {
        grantId: g.id,
        planTitle: g.plan.title,
        operableOptions: g.operableOptions.toFixed(0),
        deadline,
        daysRemaining,
        deadlineType: isOffboardingClose
          ? ("OFFBOARDING_WINDOW" as const)
          : ("EXERCISE_PERIOD" as const),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 行权期提醒：≤ 90 天 或 已过期；同时有窗口期截止日时取较早者作为实际截止日
  const now = Date.now();
  const exerciseAlerts = exerciseScan
    .map((g) => {
      const candidates: Date[] = [];
      if (g.exerciseDeadline) candidates.push(g.exerciseDeadline);
      if (g.exerciseWindowDeadline) candidates.push(g.exerciseWindowDeadline);
      if (candidates.length === 0) return null;
      const effective = candidates.reduce((a, b) => (a < b ? a : b));
      const diff = effective.getTime() - now;
      const expired = diff < -24 * 60 * 60 * 1000; // 真正过了一天才算过期
      const within90 = diff <= NINETY_DAYS_MS;
      if (!expired && !within90) return null;
      const dl = new Date(effective);
      const dlMidnight = new Date(
        dl.getFullYear(),
        dl.getMonth(),
        dl.getDate()
      ).getTime();
      const daysRemaining = Math.round(
        (dlMidnight - todayMidnight) / (24 * 60 * 60 * 1000)
      );
      return {
        grantId: g.id,
        planTitle: g.plan.title,
        operableOptions: g.operableOptions.toFixed(0),
        deadline: effective,
        daysRemaining,
        expired: daysRemaining < 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return ok({
    offboarded: user?.employmentStatus === "离职",
    closingGrants: grants,
    exerciseDeadlineAlerts: exerciseAlerts,
    pendingPaymentCount,
  });
}

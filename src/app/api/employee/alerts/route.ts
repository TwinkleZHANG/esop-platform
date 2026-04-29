import { GrantStatus, TaxEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isErrorResponse, ok, requireSession } from "@/lib/api-utils";

export async function GET() {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;

  // 员工端提醒：按 session.user.id 过滤；管理员切到员工视图时也走同一份数据
  const [user, closing, pendingPaymentCount] = await Promise.all([
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
  const grants = closing.map((g) => {
    // 离职关闭：用 exerciseWindowDeadline（已是 min(exerciseDeadline, 今天+窗口期)）
    // 正常关闭：exerciseWindowDeadline 为 null，用原 exerciseDeadline
    const isOffboardingClose = g.exerciseWindowDeadline !== null;
    const deadline = g.exerciseWindowDeadline ?? g.exerciseDeadline;
    let daysRemaining = 0;
    if (deadline) {
      const dl = new Date(deadline);
      const dlMidnight = new Date(
        dl.getFullYear(),
        dl.getMonth(),
        dl.getDate()
      ).getTime();
      daysRemaining = Math.round(
        (dlMidnight - todayMidnight) / (24 * 60 * 60 * 1000)
      );
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
  });

  return ok({
    offboarded: user?.employmentStatus === "离职",
    closingGrants: grants,
    pendingPaymentCount,
  });
}

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
      },
      select: {
        id: true,
        operableOptions: true,
        exerciseWindowDeadline: true,
        plan: { select: { title: true } },
      },
      orderBy: { exerciseWindowDeadline: "asc" },
    }),
    prisma.taxEvent.count({
      where: {
        userId: session.user.id,
        status: TaxEventStatus.PENDING_PAYMENT,
      },
    }),
  ]);

  const now = Date.now();
  const grants = closing.map((g) => {
    const deadline = g.exerciseWindowDeadline;
    const daysRemaining = deadline
      ? Math.max(
          0,
          Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000))
        )
      : 0;
    return {
      grantId: g.id,
      planTitle: g.plan.title,
      operableOptions: g.operableOptions.toFixed(0),
      deadline,
      daysRemaining,
    };
  });

  return ok({
    offboarded: user?.employmentStatus === "离职",
    closingGrants: grants,
    pendingPaymentCount,
  });
}

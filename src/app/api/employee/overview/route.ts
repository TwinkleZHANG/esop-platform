import {
  GrantStatus,
  PlanType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  ok,
  requireSession,
} from "@/lib/api-utils";

interface AssetRow {
  key: string;
  holdingEntityName: string | null;
  planType: PlanType;
  operableShares: Prisma.Decimal;
  operableOptions: Prisma.Decimal;
}

export async function GET() {
  const session = await requireSession();
  if (isErrorResponse(session)) return session;
  // 员工端 API：按 session.user.id 过滤，员工与管理员均可访问自己的数据

  const [user, grants, latestValuation] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        employeeId: true,
        department: true,
        legalIdentity: true,
        taxResidence: true,
        employmentStatus: true,
      },
    }),
    prisma.grant.findMany({
      where: {
        userId: session.user.id,
        status: { not: GrantStatus.DRAFT },
      },
      select: {
        holdingEntityId: true,
        operableShares: true,
        operableOptions: true,
        holdingEntity: { select: { name: true } },
        plan: { select: { type: true } },
      },
    }),
    prisma.valuation.findFirst({ orderBy: { valuationDate: "desc" } }),
  ]);

  if (!user) return fail("员工不存在", 404);

  // 按 (holdingEntityId|null, planType) 聚合
  const map = new Map<string, AssetRow>();
  for (const g of grants) {
    const key = `${g.holdingEntityId ?? "NULL"}::${g.plan.type}`;
    const row = map.get(key);
    if (row) {
      row.operableShares = row.operableShares.add(g.operableShares);
      row.operableOptions = row.operableOptions.add(g.operableOptions);
    } else {
      map.set(key, {
        key,
        holdingEntityName: g.holdingEntity?.name ?? null,
        planType: g.plan.type,
        operableShares: new Prisma.Decimal(g.operableShares),
        operableOptions: new Prisma.Decimal(g.operableOptions),
      });
    }
  }

  const fmv = latestValuation?.fmv ?? new Prisma.Decimal(0);
  const assets = Array.from(map.values())
    .sort(
      (a, b) =>
        (a.holdingEntityName ?? "").localeCompare(b.holdingEntityName ?? "") ||
        a.planType.localeCompare(b.planType)
    )
    .map((r) => ({
      key: r.key,
      holdingEntityName: r.holdingEntityName,
      planType: r.planType,
      operableShares: r.operableShares.toFixed(0),
      operableOptions: r.operableOptions.toFixed(0),
      marketValue: r.operableShares.mul(fmv).toFixed(2),
    }));

  return ok({
    user,
    assets,
    valuation: latestValuation
      ? {
          fmv: latestValuation.fmv.toFixed(2),
          valuationDate: latestValuation.valuationDate,
        }
      : null,
  });
}

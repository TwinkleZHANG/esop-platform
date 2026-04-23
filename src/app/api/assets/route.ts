import {
  GrantStatus,
  PlanType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isErrorResponse,
  ok,
  requirePermission,
} from "@/lib/api-utils";

interface AssetRow {
  key: string;
  userId: string;
  userName: string;
  employeeId: string;
  employmentStatus: string;
  holdingEntityId: string | null;
  holdingEntityName: string | null;
  planType: PlanType;
  operableShares: string;
  operableOptions: string;
}

export async function GET(req: Request) {
  const guard = await requirePermission("asset.view");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status"); // 在职/离职/ALL

  const userWhere: Prisma.UserWhereInput = { role: UserRole.EMPLOYEE };
  if (status === "在职" || status === "离职") {
    userWhere.employmentStatus = status;
  }
  if (search) {
    userWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { employeeId: { contains: search, mode: "insensitive" } },
    ];
  }

  // 取符合条件的员工及其非 Draft 授予
  const grants = await prisma.grant.findMany({
    where: {
      status: { not: GrantStatus.DRAFT },
      user: userWhere,
    },
    select: {
      id: true,
      holdingEntityId: true,
      operableShares: true,
      operableOptions: true,
      user: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          employmentStatus: true,
        },
      },
      holdingEntity: { select: { id: true, name: true } },
      plan: { select: { type: true } },
    },
  });

  // 聚合：(userId, holdingEntityId|null, planType)
  const map = new Map<string, AssetRow>();
  for (const g of grants) {
    const key = `${g.user.id}::${g.holdingEntityId ?? "NULL"}::${g.plan.type}`;
    const row = map.get(key);
    if (row) {
      row.operableShares = new Prisma.Decimal(row.operableShares)
        .add(g.operableShares)
        .toFixed(0);
      row.operableOptions = new Prisma.Decimal(row.operableOptions)
        .add(g.operableOptions)
        .toFixed(0);
    } else {
      map.set(key, {
        key,
        userId: g.user.id,
        userName: g.user.name,
        employeeId: g.user.employeeId,
        employmentStatus: g.user.employmentStatus,
        holdingEntityId: g.holdingEntityId ?? null,
        holdingEntityName: g.holdingEntity?.name ?? null,
        planType: g.plan.type,
        operableShares: g.operableShares.toFixed(0),
        operableOptions: g.operableOptions.toFixed(0),
      });
    }
  }

  const items = Array.from(map.values()).sort((a, b) => {
    // 按员工姓名排序，再按类型
    const n = a.userName.localeCompare(b.userName);
    if (n !== 0) return n;
    return a.planType.localeCompare(b.planType);
  });

  // 顶部信息栏：最新估值
  const latestValuation = await prisma.valuation.findFirst({
    orderBy: { valuationDate: "desc" },
  });

  return ok({
    items,
    total: items.length,
    valuation: latestValuation
      ? {
          fmv: latestValuation.fmv.toFixed(2),
          valuationDate: latestValuation.valuationDate,
        }
      : null,
  });
}

import {
  GrantStatus,
  PlanType,
  Prisma,
  UserRole,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  requirePermission,
} from "@/lib/api-utils";

interface AggRow {
  key: string;
  userName: string;
  employeeId: string;
  employmentStatus: string;
  holdingEntityName: string | null;
  planType: PlanType;
  operableShares: Prisma.Decimal;
  operableOptions: Prisma.Decimal;
}

export async function GET(req: Request) {
  const guard = await requirePermission("asset.export");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");

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

  const grants = await prisma.grant.findMany({
    where: {
      status: { not: GrantStatus.DRAFT },
      user: userWhere,
    },
    select: {
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

  const map = new Map<string, AggRow>();
  for (const g of grants) {
    const key = `${g.user.id}::${g.holdingEntityId ?? "NULL"}::${g.plan.type}`;
    const row = map.get(key);
    if (row) {
      row.operableShares = row.operableShares.add(g.operableShares);
      row.operableOptions = row.operableOptions.add(g.operableOptions);
    } else {
      map.set(key, {
        key,
        userName: g.user.name,
        employeeId: g.user.employeeId,
        employmentStatus: g.user.employmentStatus,
        holdingEntityName: g.holdingEntity?.name ?? null,
        planType: g.plan.type,
        operableShares: new Prisma.Decimal(g.operableShares),
        operableOptions: new Prisma.Decimal(g.operableOptions),
      });
    }
  }

  const rows = Array.from(map.values()).sort((a, b) =>
    a.userName.localeCompare(b.userName)
  );
  if (rows.length === 0) return fail("无数据可导出", 404);

  const data = rows.map((r) => ({
    员工姓名: r.userName,
    员工ID: r.employeeId,
    持股实体: r.holdingEntityName ?? "",
    激励类型: r.planType,
    可操作股数: r.operableShares.toFixed(0),
    可操作期权: r.planType === "RSU" ? "" : r.operableOptions.toFixed(0),
    员工状态: r.employmentStatus,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "资产管理");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const filename = `assets-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

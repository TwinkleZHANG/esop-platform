import { Prisma, TaxEventStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  fail,
  isErrorResponse,
  requirePermission,
} from "@/lib/api-utils";
import {
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";

export async function GET(req: Request) {
  const guard = await requirePermission("taxEvent.export");
  if (isErrorResponse(guard)) return guard;

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const where: Prisma.TaxEventWhereInput = {};
  if (
    status === "PENDING_PAYMENT" ||
    status === "RECEIPT_UPLOADED" ||
    status === "CONFIRMED"
  ) {
    where.status = status as TaxEventStatus;
  }
  if (search) {
    where.user = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ],
    };
  }
  if (fromStr || toStr) {
    const range: Prisma.DateTimeFilter = {};
    if (fromStr) {
      const dt = new Date(fromStr);
      if (!isNaN(dt.getTime())) range.gte = dt;
    }
    if (toStr) {
      const dt = new Date(toStr);
      if (!isNaN(dt.getTime())) {
        dt.setHours(23, 59, 59, 999);
        range.lte = dt;
      }
    }
    where.eventDate = range;
  }

  const rows = await prisma.taxEvent.findMany({
    where,
    orderBy: { eventDate: "desc" },
    include: {
      user: { select: { name: true, employeeId: true } },
      grant: {
        select: {
          id: true,
          plan: { select: { title: true, type: true } },
        },
      },
      operationRequest: { select: { id: true } },
    },
  });

  if (rows.length === 0) return fail("无数据可导出", 404);

  const data = rows.map((t) => ({
    税务事件编号: t.id,
    权利ID: t.grantId,
    激励计划: t.grant.plan.title,
    激励类型: t.grant.plan.type,
    员工ID: t.user.employeeId,
    员工姓名: t.user.name,
    税务类型: TAX_EVENT_TYPE_LABEL[t.eventType],
    具体操作: t.operationType,
    操作目标:
      t.operationTarget === "SHARES"
        ? "实股"
        : t.operationTarget === "OPTIONS"
        ? "期权"
        : "",
    数量: t.quantity.toFixed(0),
    触发日期: t.eventDate.toISOString().slice(0, 10),
    触发日公允价FMV: t.fmvAtEvent.toFixed(2),
    行权价: t.strikePrice.toFixed(2),
    税务状态: TAX_EVENT_STATUS_LABEL[t.status],
    凭证数量: t.receiptFiles.length,
    员工备注: t.employeeNotes ?? "",
    关联申请ID: t.operationRequest?.id ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "税务事件");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const filename = `tax-events-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type {
  OperationTarget,
  TaxEventStatus,
  TaxEventType,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListPageShell } from "@/components/list-page/list-page-shell";
import { SearchToolbar } from "@/components/list-page/search-toolbar";
import { Pagination } from "@/components/list-page/pagination";
import { StatusBadge } from "@/components/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { hasPermission } from "@/lib/permissions";
import {
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_STATUS_OPTIONS,
  TAX_EVENT_STATUS_TONE,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";
import { TaxEventDetailDialog } from "./tax-event-detail-dialog";

interface Row {
  id: string;
  user: { id: string; name: string; employeeId: string };
  grant: {
    id: string;
    plan: { title: string; type: "RSU" | "OPTION" };
  };
  eventType: TaxEventType;
  operationType: string;
  operationTarget: OperationTarget | null;
  quantity: string;
  eventDate: string;
  fmvAtEvent: string;
  strikePrice: string;
  status: TaxEventStatus;
  receiptFiles: string[];
  employeeNotes: string | null;
}

export function TaxEventsClient() {
  const { data: session } = useSession();
  const canConfirm = hasPermission(session?.user?.role, "taxEvent.confirm");
  const canExport = hasPermission(session?.user?.role, "taxEvent.export");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [data, setData] = useState<{
    items: Row[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [pendingPage, setPendingPage] = useState(1);
  const [pending, setPending] = useState<{
    items: Row[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 3 });
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/tax-events?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status, from, to, page]);

  const loadPending = useCallback(async () => {
    const qs = new URLSearchParams({
      status: "RECEIPT_UPLOADED",
      pageSize: "3",
      page: String(pendingPage),
    });
    const res = await fetch(`/api/tax-events?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setPending(json.data);
  }, [pendingPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, from, to]);

  function handleExport() {
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    window.location.href = `/api/tax-events/export?${qs.toString()}`;
  }

  return (
    <>
      <ListPageShell
        title="税务事件单"
        actions={
          canExport && (
            <Button variant="outline" onClick={handleExport}>
              导出 Excel
            </Button>
          )
        }
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按员工姓名或 ID 搜索",
            }}
            dateRange={{
              from,
              to,
              onChange: (f, t) => {
                setFrom(f);
                setTo(t);
              },
              label: "触发日期",
            }}
            filters={[
              {
                name: "status",
                placeholder: "税务状态",
                value: status,
                onChange: setStatus,
                options: TAX_EVENT_STATUS_OPTIONS,
              },
            ]}
          />
        }
        pagination={
          <Pagination
            page={page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        }
      >
        {pending.total > 0 && (
          <PendingBanner
            rows={pending.items}
            total={pending.total}
            page={pendingPage}
            pageSize={pending.pageSize}
            onPageChange={setPendingPage}
            onClickRow={(id) => setDetailId(id)}
          />
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工</TableHead>
              <TableHead>激励计划</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>税务类型</TableHead>
              <TableHead>具体操作</TableHead>
              <TableHead>触发日期</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  暂无税务事件
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[160px] truncate">
                    {r.user.name}（{r.user.employeeId}）
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {r.grant?.plan?.title ?? "-"}
                  </TableCell>
                  <TableCell>{r.grant?.plan?.type ?? "-"}</TableCell>
                  <TableCell>{TAX_EVENT_TYPE_LABEL[r.eventType]}</TableCell>
                  <TableCell>{r.operationType}</TableCell>
                  <TableCell>
                    {new Date(r.eventDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell>
                    <StatusBadge tone={TAX_EVENT_STATUS_TONE[r.status]}>
                      {TAX_EVENT_STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailId(r.id)}
                    >
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <TaxEventDetailDialog
        taxEventId={detailId}
        onClose={() => setDetailId(null)}
        canConfirm={canConfirm}
        onConfirmed={async () => {
          await Promise.all([load(), loadPending()]);
        }}
      />
    </>
  );
}

function PendingBanner({
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  onClickRow,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onClickRow: (id: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="border-b border-border bg-violet-50/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-violet-800">
          已上传凭证待确认（共 {total} 条）
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="text-sm">
            <button
              type="button"
              onClick={() => onClickRow(r.id)}
              className="text-primary hover:underline"
            >
              {r.user.name} · {r.grant?.plan?.title ?? "-"} · {r.operationType}
            </button>
            <span className="ml-2 text-muted-foreground">
              数量 {r.quantity} · 触发{" "}
              {new Date(r.eventDate).toLocaleDateString("zh-CN")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

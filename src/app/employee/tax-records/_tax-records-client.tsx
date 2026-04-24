"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  OperationTarget,
  TaxEventStatus,
  TaxEventType,
} from "@prisma/client";
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
import {
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_STATUS_OPTIONS,
  TAX_EVENT_STATUS_TONE,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";
import { UploadDialog } from "./_upload-dialog";

interface Row {
  id: string;
  planTitle: string;
  planType: "RSU" | "OPTION";
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

export function EmployeeTaxRecordsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "ALL");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [page, setPage] = useState(
    Number(searchParams.get("page") ?? "1") || 1
  );
  const debouncedSearch = useDebouncedValue(search, 300);
  const firstRun = useRef(true);

  const [data, setData] = useState<{
    items: Row[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/employee/tax-records?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, status, from, to]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [search, status, from, to, page, pathname, router]);

  return (
    <>
      <ListPageShell
        title="税务记录"
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按计划标题 / ID 搜索",
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
                placeholder: "状态",
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>激励计划</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>税务类型</TableHead>
              <TableHead>具体操作</TableHead>
              <TableHead>触发日期</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>凭证</TableHead>
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
                  暂无税务记录
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate">
                    {r.planTitle}
                  </TableCell>
                  <TableCell>{r.planType}</TableCell>
                  <TableCell>{TAX_EVENT_TYPE_LABEL[r.eventType]}</TableCell>
                  <TableCell>{r.operationType}</TableCell>
                  <TableCell>
                    {new Date(r.eventDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell>
                    {r.receiptFiles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">未上传</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {r.receiptFiles.map((_, idx) => (
                          <a
                            key={idx}
                            href={`/api/tax-events/${r.id}/files/${idx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            凭证 {idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={TAX_EVENT_STATUS_TONE[r.status]}>
                      {TAX_EVENT_STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {r.status !== "CONFIRMED" ? (
                      <button
                        type="button"
                        onClick={() => setUploadTarget(r)}
                        className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
                      >
                        上传转账回单
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        已确定
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <UploadDialog
        target={
          uploadTarget
            ? {
                id: uploadTarget.id,
                planTitle: uploadTarget.planTitle,
                operationType: uploadTarget.operationType,
                existingNotes: uploadTarget.employeeNotes,
              }
            : null
        }
        onClose={() => setUploadTarget(null)}
        onUploaded={load}
      />
    </>
  );
}

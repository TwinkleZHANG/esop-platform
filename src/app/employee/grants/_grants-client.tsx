"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { GrantStatus } from "@prisma/client";
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
import {
  GRANT_STATUS_LABEL,
  GRANT_STATUS_TONE,
} from "@/lib/i18n";
import { RequestDialog } from "./_request-dialog";

interface Row {
  id: string;
  plan: { id: string; title: string; type: "RSU" | "OPTION" };
  totalQuantity: string;
  strikePrice: string;
  grantDate: string;
  vestingStartDate: string | null;
  status: GrantStatus;
  operableShares: string;
  operableOptions: string;
}

// 员工端不含 Draft（API 已过滤）
const STATUS_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "GRANTED", label: "已授予" },
  { value: "VESTING", label: "归属中" },
  { value: "FULLY_VESTED", label: "全部归属" },
  { value: "STILL_EXERCISABLE", label: "仍可行权" },
  { value: "ALL_SETTLED", label: "全部交割" },
  { value: "CLOSING", label: "关闭中" },
  { value: "CLOSED", label: "已关闭" },
];

function canApply(row: Row): boolean {
  const hasShares = Number(row.operableShares) > 0;
  const hasOpts = Number(row.operableOptions) > 0;
  if (row.status === "ALL_SETTLED") return false;
  if (row.status === "CLOSED") {
    return hasShares; // 仅实股可继续操作（Closed 后 operableOptions 已清零或无意义）
  }
  // CLOSING + 窗口期内：API 层面仍保留 operableOptions，按钮可用
  return hasShares || hasOpts;
}

export function EmployeeGrantsClient() {
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
  const [requestTarget, setRequestTarget] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/employee/grants?${qs.toString()}`);
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
        title="授予记录"
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
              label: "授予日期",
            }}
            filters={[
              {
                name: "status",
                placeholder: "状态",
                value: status,
                onChange: setStatus,
                options: STATUS_OPTIONS,
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
              <TableHead>计划</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>授予数量</TableHead>
              <TableHead>行权价</TableHead>
              <TableHead>授予日期</TableHead>
              <TableHead>授予计划开始日期</TableHead>
              <TableHead>可操作股数</TableHead>
              <TableHead>可操作期权</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  暂无授予记录
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate">
                    {r.plan.title}
                  </TableCell>
                  <TableCell>{r.plan.type}</TableCell>
                  <TableCell>{r.totalQuantity}</TableCell>
                  <TableCell>{r.strikePrice}</TableCell>
                  <TableCell>
                    {new Date(r.grantDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    {r.vestingStartDate
                      ? new Date(r.vestingStartDate).toLocaleDateString("zh-CN")
                      : "-"}
                  </TableCell>
                  <TableCell>{r.operableShares}</TableCell>
                  <TableCell>
                    {r.plan.type === "RSU" ? "-" : r.operableOptions}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={GRANT_STATUS_TONE[r.status]}>
                      {GRANT_STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {canApply(r) ? (
                      <Button
                        size="sm"
                        onClick={() => setRequestTarget(r)}
                      >
                        申请
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <RequestDialog
        grant={
          requestTarget
            ? {
                id: requestTarget.id,
                planType: requestTarget.plan.type,
                planTitle: requestTarget.plan.title,
                operableShares: requestTarget.operableShares,
                operableOptions: requestTarget.operableOptions,
              }
            : null
        }
        onClose={() => setRequestTarget(null)}
        onSubmitted={load}
      />
    </>
  );
}

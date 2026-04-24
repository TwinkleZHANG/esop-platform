"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  OperationRequestStatus,
  OperationRequestType,
  OperationTarget,
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

const TYPE_LABEL: Record<OperationRequestType, string> = {
  EXERCISE: "行权",
  TRANSFER: "转让",
  SELL: "售出",
  BUYBACK: "回购",
  REDEEM: "兑现",
};

const TARGET_LABEL: Record<OperationTarget, string> = {
  SHARES: "实股",
  OPTIONS: "期权",
};

const STATUS_LABEL: Record<OperationRequestStatus, string> = {
  PENDING: "待审批",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  CLOSED: "已关闭",
};

const STATUS_TONE: Record<OperationRequestStatus, "warn" | "success" | "danger" | "muted"> = {
  PENDING: "warn",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "muted",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待审批" },
  { value: "APPROVED", label: "已批准" },
  { value: "REJECTED", label: "已驳回" },
  { value: "CLOSED", label: "已关闭" },
];

interface Row {
  id: string;
  planTitle: string;
  planType: "RSU" | "OPTION";
  requestType: OperationRequestType;
  requestTarget: OperationTarget | null;
  quantity: string;
  status: OperationRequestStatus;
  submitDate: string;
  approveDate: string | null;
  approverNotes: string | null;
}

export function EmployeeRequestsClient() {
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

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/employee/requests?${qs.toString()}`);
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
    <ListPageShell
      title="申请记录"
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
            label: "申请时间",
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
            <TableHead>申请操作</TableHead>
            <TableHead>申请目标</TableHead>
            <TableHead>申请数量</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>申请时间</TableHead>
            <TableHead>审批备注</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
          ) : data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                暂无申请
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[220px] truncate">
                  {r.planTitle}
                </TableCell>
                <TableCell>{TYPE_LABEL[r.requestType]}</TableCell>
                <TableCell>
                  {r.requestTarget
                    ? TARGET_LABEL[r.requestTarget]
                    : r.planType === "RSU"
                    ? "实股"
                    : "-"}
                </TableCell>
                <TableCell>{r.quantity}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  {new Date(r.submitDate).toLocaleString("zh-CN")}
                </TableCell>
                <TableCell className="max-w-[240px] truncate">
                  {r.approverNotes ?? "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ListPageShell>
  );
}

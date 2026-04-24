"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { VestingRecordStatus } from "@prisma/client";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const STATUS_LABEL: Record<VestingRecordStatus, string> = {
  PENDING: "待归属",
  VESTED: "已归属",
  PARTIALLY_SETTLED: "部分行权",
  SETTLED: "已交割",
  CLOSED: "已关闭",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待归属" },
  { value: "VESTED", label: "已归属" },
  { value: "PARTIALLY_SETTLED", label: "部分行权" },
  { value: "SETTLED", label: "已交割" },
  { value: "CLOSED", label: "已关闭" },
];

interface Row {
  id: string;
  grantId: string;
  planTitle: string;
  planType: "RSU" | "OPTION";
  vestingDate: string;
  quantity: string;
  exercisableOptions: string;
  status: VestingRecordStatus;
}

export function EmployeeVestingClient() {
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
    const res = await fetch(`/api/employee/vesting?${qs.toString()}`);
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
      title="归属详情"
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
            label: "归属日期",
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
            <TableHead>归属日期</TableHead>
            <TableHead>归属数量</TableHead>
            <TableHead>可行权期权数</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
          ) : data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                暂无归属记录
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="max-w-[220px] truncate">
                  {v.planTitle}
                </TableCell>
                <TableCell>{v.planType}</TableCell>
                <TableCell>
                  {new Date(v.vestingDate).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>{v.quantity}</TableCell>
                <TableCell>
                  {v.planType === "RSU" ? "-" : v.exercisableOptions}
                </TableCell>
                <TableCell>{STATUS_LABEL[v.status]}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ListPageShell>
  );
}

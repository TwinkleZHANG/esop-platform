"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { PlanType } from "@prisma/client";
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
import { StatusBadge } from "@/components/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { hasPermission } from "@/lib/permissions";

interface Row {
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

interface Data {
  items: Row[];
  total: number;
  valuation: { fmv: string; valuationDate: string } | null;
}

export function AssetsClient() {
  const { data: session } = useSession();
  const canExport = hasPermission(session?.user?.role, "asset.export");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "ALL");
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status && status !== "ALL") qs.set("status", status);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [search, status, pathname, router]);

  const [data, setData] = useState<Data>({ items: [], total: 0, valuation: null });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    const res = await fetch(`/api/assets?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExport() {
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    window.location.href = `/api/assets/export?${qs.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <div>
            <span className="text-muted-foreground">当前估值：</span>
            <span className="font-mono font-semibold">
              {data.valuation ? `${data.valuation.fmv} HKD` : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">估值日期：</span>
            <span>
              {data.valuation
                ? new Date(data.valuation.valuationDate).toLocaleDateString(
                    "zh-CN"
                  )
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <ListPageShell
        title="资产管理"
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
              placeholder: "按姓名或员工 ID 搜索",
            }}
            filters={[
              {
                name: "status",
                placeholder: "员工状态",
                value: status,
                onChange: setStatus,
                options: [
                  { value: "ALL", label: "全部" },
                  { value: "在职", label: "在职" },
                  { value: "离职", label: "离职" },
                ],
              },
            ]}
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工姓名</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>持股实体</TableHead>
              <TableHead>激励类型</TableHead>
              <TableHead>可操作股数</TableHead>
              <TableHead>可操作期权</TableHead>
              <TableHead>员工状态</TableHead>
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
                  暂无资产数据
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Link
                      href={`/admin/assets/${r.userId}`}
                      className="text-primary hover:underline"
                    >
                      {r.userName}
                    </Link>
                  </TableCell>
                  <TableCell>{r.employeeId}</TableCell>
                  <TableCell>{r.holdingEntityName ?? "-"}</TableCell>
                  <TableCell>{r.planType}</TableCell>
                  <TableCell>{r.operableShares}</TableCell>
                  <TableCell>
                    {r.planType === "RSU" ? "-" : r.operableOptions}
                  </TableCell>
                  <TableCell>
                    {r.employmentStatus === "在职" ? (
                      <StatusBadge tone="success">在职</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">离职</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>
    </div>
  );
}

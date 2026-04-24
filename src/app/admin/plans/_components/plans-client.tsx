"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { StatusBadge } from "@/components/status-badge";
import { hasPermission } from "@/lib/permissions";
import { PlanFormDialog, type PlanFormValue } from "./plan-form-dialog";

interface PlanRow {
  id: string;
  title: string;
  type: "RSU" | "OPTION";
  jurisdiction: string;
  poolSize: string;
  grantedQuantity: string;
  remainingQuantity: string;
  status: "PENDING_APPROVAL" | "APPROVED";
}

export function PlansClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = hasPermission(role, "plan.create");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [type, setType] = useState<string>(searchParams.get("type") ?? "ALL");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [page, setPage] = useState(
    Number(searchParams.get("page") ?? "1") || 1
  );
  const debouncedSearch = useDebouncedValue(search, 300);
  const firstRun = useRef(true);

  const [data, setData] = useState<{
    items: PlanRow[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (type && type !== "ALL") qs.set("type", type);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/plans?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, type, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, type, from, to]);

  // URL 持久化：把筛选状态同步写到 query
  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (type && type !== "ALL") qs.set("type", type);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [search, type, from, to, page, pathname, router]);

  // Dashboard 快捷操作：?action=create 自动打开创建弹窗
  useEffect(() => {
    if (searchParams.get("action") === "create" && canCreate) {
      setDialogOpen(true);
      router.replace("/admin/plans");
    }
  }, [searchParams, canCreate, router]);

  const createPlan = async (v: PlanFormValue) => {
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: v.title,
        type: v.type,
        jurisdiction: v.jurisdiction,
        deliveryMethods: v.deliveryMethods,
        poolSize: v.poolSize,
        effectiveDate: v.effectiveDate,
        boardResolutionId: v.boardResolutionId || undefined,
        notes: v.notes || undefined,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "创建失败");
    await load();
  };

  const toolbar = useMemo(
    () => (
      <SearchToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "按计划标题或 ID 搜索",
        }}
        dateRange={{
          from,
          to,
          onChange: (f, t) => {
            setFrom(f);
            setTo(t);
          },
          label: "创建日期",
        }}
        filters={[
          {
            name: "type",
            placeholder: "激励类型",
            value: type,
            onChange: setType,
            options: [
              { value: "ALL", label: "全部" },
              { value: "RSU", label: "RSU" },
              { value: "OPTION", label: "Option" },
            ],
          },
        ]}
      />
    ),
    [search, type, from, to]
  );

  return (
    <>
      <ListPageShell
        title="激励计划池"
        actions={
          canCreate && (
            <Button onClick={() => setDialogOpen(true)}>+ 创建计划</Button>
          )
        }
        toolbar={toolbar}
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
              <TableHead>计划标题</TableHead>
              <TableHead>激励类型</TableHead>
              <TableHead>适用法域</TableHead>
              <TableHead>激励池规模</TableHead>
              <TableHead>已授予</TableHead>
              <TableHead>剩余额度</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[220px] truncate">
                    {p.title}
                  </TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{p.jurisdiction}</TableCell>
                  <TableCell>{p.poolSize}</TableCell>
                  <TableCell>{p.grantedQuantity}</TableCell>
                  <TableCell>{p.remainingQuantity}</TableCell>
                  <TableCell>
                    {p.status === "APPROVED" ? (
                      <StatusBadge tone="success">已通过</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">审批中</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/plans/${p.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      查看
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <PlanFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        onSubmit={createPlan}
      />
    </>
  );
}

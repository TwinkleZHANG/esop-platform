"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { HoldingEntity } from "@prisma/client";
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
import { StatusBadge } from "@/components/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { hasPermission } from "@/lib/permissions";
import {
  EntityFormDialog,
  type EntityFormValue,
  TYPE_OPTIONS,
} from "./entity-form-dialog";
// 点击"查看"进入 /admin/entities/[id] 详情页（只读），详情页按钮进入编辑 dialog

const TYPE_LABEL = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<string, string>;

export function EntitiesClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = hasPermission(role, "holdingEntity.create");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState<string>(
    searchParams.get("status") ?? "ALL"
  );
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [page, setPage] = useState(
    Number(searchParams.get("page") ?? "1") || 1
  );
  const debouncedSearch = useDebouncedValue(search, 300);
  const firstRun = useRef(true);

  const [data, setData] = useState<{
    items: HoldingEntity[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/entities?${qs.toString()}`);
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

  async function createEntity(v: EntityFormValue) {
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        entityCode: v.entityCode,
        type: v.type,
        registrationNo: v.registrationNo,
        address: v.address || null,
        establishedAt: v.establishedAt || null,
        legalRep: v.legalRep || null,
        lpAccount: v.lpAccount || null,
        taxJurisdiction: v.taxJurisdiction,
        notes: v.notes || null,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "创建失败");
    await load();
  }

  return (
    <>
      <ListPageShell
        title="持股主体库"
        actions={
          canCreate && (
            <Button onClick={() => setDialogOpen(true)}>
              + 添加持股主体
            </Button>
          )
        }
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按名称或 ID 搜索",
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
                name: "status",
                placeholder: "状态",
                value: status,
                onChange: setStatus,
                options: [
                  { value: "ALL", label: "全部" },
                  { value: "ACTIVE", label: "启用" },
                  { value: "INACTIVE", label: "停用" },
                ],
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
              <TableHead>代持主体 ID</TableHead>
              <TableHead>代持主体</TableHead>
              <TableHead>持股主体类型</TableHead>
              <TableHead>税务属地</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
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
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {e.entityCode}
                  </TableCell>
                  <TableCell>{e.name}</TableCell>
                  <TableCell>{TYPE_LABEL[e.type] ?? e.type}</TableCell>
                  <TableCell>{e.taxJurisdiction}</TableCell>
                  <TableCell>
                    {e.status === "ACTIVE" ? (
                      <StatusBadge tone="success">启用</StatusBadge>
                    ) : (
                      <StatusBadge tone="muted">停用</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/entities/${e.id}`}
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

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        onSubmit={createEntity}
      />
    </>
  );
}

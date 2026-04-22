"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { HoldingEntity } from "@prisma/client";
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
  EntityFormDialog,
  type EntityFormValue,
  TYPE_OPTIONS,
} from "./entity-form-dialog";

const TYPE_LABEL = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<string, string>;

export function EntitiesClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = hasPermission(role, "holdingEntity.create");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [data, setData] = useState<{
    items: HoldingEntity[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HoldingEntity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    qs.set("page", String(page));
    const res = await fetch(`/api/entities?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

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

  async function updateEntity(v: EntityFormValue) {
    if (!editTarget) return;
    const res = await fetch(`/api/entities/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        type: v.type,
        registrationNo: v.registrationNo,
        address: v.address || null,
        establishedAt: v.establishedAt || null,
        legalRep: v.legalRep || null,
        lpAccount: v.lpAccount || null,
        taxJurisdiction: v.taxJurisdiction,
        notes: v.notes || null,
        status: v.status,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "保存失败");
    await load();
  }

  function toFormValue(e: HoldingEntity): EntityFormValue {
    return {
      name: e.name,
      entityCode: e.entityCode,
      type: e.type,
      registrationNo: e.registrationNo,
      address: e.address ?? "",
      establishedAt: e.establishedAt
        ? new Date(e.establishedAt).toISOString().slice(0, 10)
        : "",
      legalRep: e.legalRep ?? "",
      lpAccount: e.lpAccount ?? "",
      taxJurisdiction: e.taxJurisdiction as "内地" | "香港" | "海外",
      notes: e.notes ?? "",
      status: e.status,
    };
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
                    <button
                      onClick={() => setEditTarget(e)}
                      className="text-sm text-primary hover:underline"
                    >
                      查看
                    </button>
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

      <EntityFormDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        mode="edit"
        initialValue={editTarget ? toFormValue(editTarget) : undefined}
        onSubmit={updateEntity}
      />
    </>
  );
}

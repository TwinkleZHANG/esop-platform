"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
import { Pagination } from "@/components/list-page/pagination";
import { hasPermission } from "@/lib/permissions";
import {
  ValuationDialog,
  type ValuationFormValue,
} from "./valuation-dialog";

interface Row {
  id: string;
  valuationDate: string;
  fmv: string;
  source: string | null;
  description: string | null;
}

export function ValuationsClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = hasPermission(role, "valuation.create");

  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: Row[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [hasGap, setHasGap] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, badgesRes] = await Promise.all([
      fetch(`/api/valuations?page=${page}`),
      fetch(`/api/sidebar-badges`),
    ]);
    const listJson = await listRes.json();
    if (listJson.success) setData(listJson.data);
    const badgesJson = await badgesRes.json();
    if (badgesJson.success) setHasGap(badgesJson.data.valuations > 0);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createValuation(v: ValuationFormValue) {
    const res = await fetch("/api/valuations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valuationDate: v.valuationDate,
        fmv: v.fmv,
        source: v.source || null,
        description: v.description || null,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "创建失败");
    setPage(1);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除这条估值记录？")) return;
    const res = await fetch(`/api/valuations/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      alert(json.error ?? "删除失败");
      return;
    }
    await load();
  }

  return (
    <>
      {hasGap && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>缺少估值：</strong>
          有归属记录到期但缺少对应日期的估值记录，无法生成税务事件。请添加估值记录，系统将在下次定时任务时自动补生成。
        </div>
      )}

      <ListPageShell
        title="估值管理"
        actions={
          canManage && (
            <Button onClick={() => setDialogOpen(true)}>
              + 添加估值记录
            </Button>
          )
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
              <TableHead>估值日期</TableHead>
              <TableHead>FMV（港币）</TableHead>
              <TableHead>估值来源</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  暂无估值记录
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    {new Date(v.valuationDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="font-mono">{v.fmv}</TableCell>
                  <TableCell>{v.source ?? "-"}</TableCell>
                  <TableCell>
                    {canManage && (
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="text-sm text-destructive hover:underline"
                      >
                        删除
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <ValuationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={createValuation}
      />
    </>
  );
}

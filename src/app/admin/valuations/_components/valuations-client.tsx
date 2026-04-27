"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { SearchToolbar } from "@/components/list-page/search-toolbar";
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

interface LogRow {
  id: string;
  action: "CREATED" | "DELETED";
  fmv: string;
  valuationDate: string;
  operatorName: string;
  timestampDisplay: string;
}

export function ValuationsClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = hasPermission(role, "valuation.create");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [page, setPage] = useState(
    Number(searchParams.get("page") ?? "1") || 1
  );
  const firstRun = useRef(true);
  const [data, setData] = useState<{
    items: Row[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [hasGap, setHasGap] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const [listRes, badgesRes, logsRes] = await Promise.all([
      fetch(`/api/valuations?${qs.toString()}`),
      fetch(`/api/sidebar-badges`),
      fetch(`/api/valuations/logs`),
    ]);
    const listJson = await listRes.json();
    if (listJson.success) setData(listJson.data);
    const badgesJson = await badgesRes.json();
    if (badgesJson.success) setHasGap(badgesJson.data.valuations > 0);
    const logsJson = await logsRes.json();
    if (logsJson.success) setLogs(logsJson.data);
    setLoading(false);
  }, [page, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setPage(1);
  }, [from, to]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [from, to, page, pathname, router]);

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
        toolbar={
          <SearchToolbar
            dateRange={{
              from,
              to,
              onChange: (f, t) => {
                setFrom(f);
                setTo(t);
              },
              label: "估值日期",
            }}
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
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(v.id)}
                      >
                        删除
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <section className="mt-6 min-w-0">
        <h2 className="mb-2 text-sm font-semibold">操作记录</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无操作记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>估值日期</TableHead>
                <TableHead>FMV（HKD）</TableHead>
                <TableHead>操作人</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.timestampDisplay}</TableCell>
                  <TableCell>
                    {l.action === "CREATED" ? "添加估值" : "删除估值"}
                  </TableCell>
                  <TableCell>
                    {new Date(l.valuationDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell className="font-mono">{l.fmv}</TableCell>
                  <TableCell>{l.operatorName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <ValuationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={createValuation}
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { GrantStatus } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  GRANT_STATUS_LABEL,
  GRANT_STATUS_OPTIONS,
  GRANT_STATUS_TONE,
} from "@/lib/i18n";
import {
  GrantFormDialog,
  type GrantFormValue,
} from "./grant-form-dialog";

interface GrantRow {
  id: string;
  plan: { id: string; title: string; type: "RSU" | "OPTION" };
  user: { id: string; name: string; employeeId: string };
  totalQuantity: string;
  strikePrice: string;
  grantDate: string;
  status: GrantStatus;
  operableShares: string;
  operableOptions: string;
  pendingRequestCount: number;
}

interface Paged {
  items: GrantRow[];
  total: number;
  pageSize: number;
}

export function GrantsClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = hasPermission(role, "grant.create");

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

  const [data, setData] = useState<Paged>({
    items: [],
    total: 0,
    pageSize: 10,
  });
  const [pending, setPending] = useState<Paged>({
    items: [],
    total: 0,
    pageSize: 3,
  });
  const [pendingPage, setPendingPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status && status !== "ALL") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/grants?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status, from, to, page]);

  const loadPending = useCallback(async () => {
    const qs = new URLSearchParams({
      hasPending: "1",
      pageSize: "3",
      page: String(pendingPage),
    });
    const res = await fetch(`/api/grants?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setPending(json.data);
  }, [pendingPage]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

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

  useEffect(() => {
    if (searchParams.get("action") === "create" && canCreate) {
      setDialogOpen(true);
      router.replace("/admin/grants");
    }
  }, [searchParams, canCreate, router]);

  async function createGrant(v: GrantFormValue) {
    const res = await fetch("/api/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: v.planId,
        userId: v.userId,
        holdingEntityId: v.holdingEntityId,
        grantDate: v.grantDate,
        vestingStartDate: v.vestingStartDate || null,
        totalQuantity: v.totalQuantity,
        strikePrice: v.strikePrice || 0,
        agreementId: v.agreementId || null,
        vestingYears: v.vestingYears,
        cliffMonths: v.cliffMonths,
        vestingFrequency: v.vestingFrequency,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "创建失败");
    await Promise.all([loadList(), loadPending()]);
  }

  return (
    <>
      <ListPageShell
        title="授予管理"
        actions={
          canCreate && (
            <Button onClick={() => setDialogOpen(true)}>+ 创建授予</Button>
          )
        }
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按计划标题/ID/员工姓名搜索",
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
                options: GRANT_STATUS_OPTIONS,
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
        {pending.total > 0 && (
          <PendingBanner
            rows={pending.items}
            total={pending.total}
            page={pendingPage}
            pageSize={pending.pageSize}
            onPageChange={setPendingPage}
          />
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工</TableHead>
              <TableHead>计划</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>授予数量</TableHead>
              <TableHead>行权价</TableHead>
              <TableHead>授予日期</TableHead>
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
              data.items.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="max-w-[160px] truncate">
                    {g.user.name}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {g.plan.title}
                  </TableCell>
                  <TableCell>{g.plan.type}</TableCell>
                  <TableCell>{g.totalQuantity}</TableCell>
                  <TableCell>{g.strikePrice}</TableCell>
                  <TableCell>
                    {new Date(g.grantDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{g.operableShares}</TableCell>
                  <TableCell>
                    {g.plan.type === "RSU" ? "-" : g.operableOptions}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={GRANT_STATUS_TONE[g.status]}>
                      {GRANT_STATUS_LABEL[g.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/grants/${g.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" })
                      )}
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

      <GrantFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={createGrant}
      />
    </>
  );
}

function PendingBanner({
  rows,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  rows: GrantRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="overflow-x-auto border-b border-border bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-sm font-medium text-amber-800">
          待审批申请提醒（共 {total} 条）
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap text-xs">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-2 whitespace-nowrap text-sm"
          >
            <Link
              href={`/admin/grants/${g.id}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" })
              )}
            >
              {g.user.name} · {g.plan.title}
            </Link>
            <span className="text-muted-foreground">
              待审批申请 {g.pendingRequestCount} 条
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

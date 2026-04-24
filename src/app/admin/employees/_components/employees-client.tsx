"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Jurisdiction } from "@prisma/client";
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
import { JURISDICTION_LABEL } from "@/lib/i18n";
import {
  EmployeeFormDialog,
  type EmployeeFormValue,
} from "./employee-form-dialog";

interface EmployeeRow {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  department: string | null;
  legalIdentity: Jurisdiction;
  employmentStatus: string;
  grantCount: number;
}

export function EmployeesClient() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = hasPermission(role, "employee.create");

  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [data, setData] = useState<{
    items: EmployeeRow[];
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
    const res = await fetch(`/api/employees?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, status, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, from, to]);

  useEffect(() => {
    if (searchParams.get("action") === "create" && canCreate) {
      setDialogOpen(true);
      router.replace("/admin/employees");
    }
  }, [searchParams, canCreate, router]);

  async function createEmployee(v: EmployeeFormValue): Promise<string | void> {
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        employeeId: v.employeeId,
        email: v.email,
        department: v.department || null,
        legalIdentity: v.legalIdentity,
        taxResidence: v.taxResidence,
        employerEntityIds: v.employerEntityIds,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "创建失败");
    await load();
    return json.data.initialPassword as string;
  }

  return (
    <>
      <ListPageShell
        title="员工档案"
        actions={
          canCreate && (
            <Button onClick={() => setDialogOpen(true)}>+ 添加员工</Button>
          )
        }
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按姓名或员工 ID 搜索",
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
                placeholder: "雇佣状态",
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
              <TableHead>姓名</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>法律身份</TableHead>
              <TableHead>授予数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
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
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.employeeId}</TableCell>
                  <TableCell>{u.department ?? "-"}</TableCell>
                  <TableCell>
                    {JURISDICTION_LABEL[u.legalIdentity]}
                  </TableCell>
                  <TableCell>{u.grantCount}</TableCell>
                  <TableCell>
                    {u.employmentStatus === "在职" ? (
                      <StatusBadge tone="success">在职</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">离职</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/employees/${u.id}`}
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

      <EmployeeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        onSubmit={createEmployee}
      />
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ListPageShell } from "@/components/list-page/list-page-shell";
import { SearchToolbar } from "@/components/list-page/search-toolbar";
import { Pagination } from "@/components/list-page/pagination";
import { StatusBadge } from "@/components/status-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  GRANT_ADMIN: "授予管理员",
  APPROVAL_ADMIN: "审批管理员",
  EMPLOYEE: "普通员工",
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "SUPER_ADMIN", label: "超级管理员" },
  { value: "GRANT_ADMIN", label: "授予管理员" },
  { value: "APPROVAL_ADMIN", label: "审批管理员" },
  { value: "EMPLOYEE", label: "普通员工" },
];

interface UserRow {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  role: UserRole;
  employmentStatus: string;
}

export function UserManagementClient() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [data, setData] = useState<{
    items: UserRow[];
    total: number;
    pageSize: number;
  }>({ items: [], total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (roleFilter && roleFilter !== "ALL") qs.set("role", roleFilter);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    const res = await fetch(`/api/user-management?${qs.toString()}`);
    const json = await res.json();
    if (json.success) setData(json.data);
    setLoading(false);
  }, [debouncedSearch, roleFilter, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, from, to]);

  return (
    <>
      <ListPageShell
        title="用户管理"
        toolbar={
          <SearchToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "按姓名或邮箱搜索",
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
                name: "role",
                placeholder: "系统角色",
                value: roleFilter,
                onChange: setRoleFilter,
                options: [
                  { value: "ALL", label: "全部" },
                  ...ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
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
              <TableHead>邮箱</TableHead>
              <TableHead>系统角色</TableHead>
              <TableHead>雇佣状态</TableHead>
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
              data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.employeeId}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>
                    {u.employmentStatus === "在职" ? (
                      <StatusBadge tone="success">在职</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">离职</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="space-x-3">
                    <button
                      onClick={() => setEditTarget(u)}
                      className="text-sm text-primary hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        setResetTarget(u);
                        setResetResult(null);
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      重置密码
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListPageShell>

      <EditRoleDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={load}
      />

      <ResetPasswordDialog
        target={resetTarget}
        result={resetResult}
        onReset={async () => {
          if (!resetTarget) return;
          const res = await fetch(`/api/user-management/${resetTarget.id}`, {
            method: "POST",
          });
          const json = await res.json();
          if (!json.success) {
            alert(json.error ?? "重置失败");
            return;
          }
          setResetResult(json.data.newPassword);
        }}
        onClose={() => {
          setResetTarget(null);
          setResetResult(null);
        }}
      />
    </>
  );
}

function EditRoleDialog({
  target,
  onClose,
  onSaved,
}: {
  target: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setRole(target.role);
      setError(null);
    }
  }, [target]);

  async function save() {
    if (!target) return;
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/user-management/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.success) {
      setError(json.error ?? "保存失败");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑角色</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              用户：{target.name}（{target.email}）
            </p>
            <div className="space-y-1">
              <Label>系统角色</Label>
              <NativeSelect
                value={role}
                onChange={(v) => setRole(v as UserRole)}
                options={ROLE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={save} disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  result,
  onReset,
  onClose,
}: {
  target: UserRow | null;
  result: string | null;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function doReset() {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <p className="text-sm">
              确定为用户{" "}
              <span className="font-medium">
                {target.name}（{target.email}）
              </span>{" "}
              生成新的初始密码？
            </p>
            {result ? (
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-muted p-3 font-mono text-sm">
                  初始密码：{result}
                </div>
                <p className="text-xs text-muted-foreground">
                  请将新密码转交给用户。下次登录时将强制修改密码。
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                重置后用户原密码将失效，下次登录需强制修改密码。
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>完成</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                取消
              </Button>
              <Button onClick={doReset} disabled={busy}>
                {busy ? "生成中..." : "确认重置"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

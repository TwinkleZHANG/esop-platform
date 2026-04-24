"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Jurisdiction } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { BackToListButton } from "@/components/back-to-list-button";
import { hasPermission } from "@/lib/permissions";
import { JURISDICTION_LABEL } from "@/lib/i18n";
import {
  EmployeeFormDialog,
  type EmployeeFormValue,
} from "../_components/employee-form-dialog";

interface EmployeeDetail {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  department: string | null;
  legalIdentity: Jurisdiction;
  taxResidence: Jurisdiction;
  employmentStatus: string;
  employerEntities: { id: string; name: string }[];
  grants: {
    id: string;
    planTitle: string;
    planType: "RSU" | "OPTION";
    totalQuantity: string;
    status: string;
    grantDate: string;
  }[];
}

export function EmployeeDetailClient({ userId }: { userId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canEdit = hasPermission(role, "employee.edit");

  const [user, setUser] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/employees/${userId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setUser(json.data);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!user) return <div className="text-sm text-muted-foreground">加载中...</div>;

  async function handleEdit(v: EmployeeFormValue) {
    const res = await fetch(`/api/employees/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        department: v.department || null,
        legalIdentity: v.legalIdentity,
        taxResidence: v.taxResidence,
        employerEntityIds: v.employerEntityIds,
        employmentStatus: v.employmentStatus,
        offboardReason: v.offboardReason,
        exerciseWindowDays: v.exerciseWindowDays,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "保存失败");
    await load();
  }

  const formValue: EmployeeFormValue = {
    name: user.name,
    employeeId: user.employeeId,
    email: user.email,
    department: user.department ?? "",
    legalIdentity: user.legalIdentity,
    taxResidence: user.taxResidence,
    employerEntityIds: user.employerEntities.map((e) => e.id),
    employmentStatus: (user.employmentStatus as "在职" | "离职") || "在职",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackToListButton />
          <h1 className="text-xl font-semibold">{user.name}</h1>
          {user.employmentStatus === "在职" ? (
            <StatusBadge tone="success">在职</StatusBadge>
          ) : (
            <StatusBadge tone="danger">离职</StatusBadge>
          )}
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            编辑
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-border bg-background p-6 text-sm">
        <Field label="员工 ID" value={user.employeeId} />
        <Field label="邮箱" value={user.email} />
        <Field label="部门" value={user.department || "-"} />
        <Field
          label="法律身份"
          value={JURISDICTION_LABEL[user.legalIdentity]}
        />
        <Field
          label="税务居住地"
          value={JURISDICTION_LABEL[user.taxResidence]}
        />
        <Field
          label="用工主体"
          value={
            user.employerEntities.length > 0
              ? user.employerEntities.map((e) => e.name).join("、")
              : "-"
          }
        />
      </dl>

      <div className="rounded-lg border border-border bg-background p-6">
        <h2 className="mb-3 text-sm font-semibold">授予记录</h2>
        {user.grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无授予记录</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {user.grants.map((g) => (
              <li key={g.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{g.planTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.planType} · 授予 {g.totalQuantity} ·{" "}
                    {new Date(g.grantDate).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {g.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EmployeeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialValue={formValue}
        onSubmit={handleEdit}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

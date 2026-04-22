"use client";

import { useEffect, useState } from "react";
import { Jurisdiction } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JURISDICTION_OPTIONS } from "@/lib/i18n";
import { EmployerEntityPicker } from "./employer-entity-picker";

export interface EmployeeFormValue {
  name: string;
  employeeId: string;
  email: string;
  department: string;
  legalIdentity: Jurisdiction;
  taxResidence: Jurisdiction;
  employerEntityIds: string[];
  employmentStatus?: "在职" | "离职";
}

const DEFAULT_VALUE: EmployeeFormValue = {
  name: "",
  employeeId: "",
  email: "",
  department: "",
  legalIdentity: "MAINLAND",
  taxResidence: "MAINLAND",
  employerEntityIds: [],
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initialValue?: EmployeeFormValue;
  onSubmit: (v: EmployeeFormValue) => Promise<string | void>;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  mode,
  initialValue,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<EmployeeFormValue>(
    initialValue ?? DEFAULT_VALUE
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialPassword, setInitialPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialValue ?? DEFAULT_VALUE);
      setError(null);
      setInitialPassword(null);
    }
  }, [open, initialValue]);

  async function handleSubmit() {
    setError(null);
    if (!form.name.trim()) return setError("员工姓名必填");
    if (mode === "create" && !form.employeeId.trim())
      return setError("员工 ID 必填");
    if (mode === "create" && !form.email.trim())
      return setError("邮箱必填");

    setSubmitting(true);
    try {
      const pwd = await onSubmit(form);
      if (mode === "create" && pwd) {
        setInitialPassword(pwd);
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑员工" : "添加员工"}</DialogTitle>
        </DialogHeader>

        {initialPassword ? (
          <div className="space-y-3">
            <p className="text-sm">员工已创建，请妥善保管并发送给员工：</p>
            <div className="rounded-md border border-border bg-muted p-3 font-mono text-sm">
              初始密码：{initialPassword}
            </div>
            <p className="text-xs text-muted-foreground">
              员工首次登录后需强制修改密码。
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>完成</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>员工姓名 *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>员工 ID *</Label>
                  <Input
                    value={form.employeeId}
                    disabled={isEdit}
                    onChange={(e) =>
                      setForm({ ...form, employeeId: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>邮箱 *</Label>
                  <Input
                    type="email"
                    disabled={isEdit}
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>部门</Label>
                  <Input
                    value={form.department}
                    onChange={(e) =>
                      setForm({ ...form, department: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>法律身份 *</Label>
                  <Select
                    value={form.legalIdentity}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        legalIdentity: (v as Jurisdiction) ?? "MAINLAND",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JURISDICTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>税务居住地 *</Label>
                  <Select
                    value={form.taxResidence}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        taxResidence: (v as Jurisdiction) ?? "MAINLAND",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JURISDICTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>用工主体</Label>
                <EmployerEntityPicker
                  value={form.employerEntityIds}
                  onChange={(ids) =>
                    setForm({ ...form, employerEntityIds: ids })
                  }
                />
              </div>

              {isEdit && (
                <div className="space-y-1">
                  <Label>雇佣状态</Label>
                  <Select
                    value={form.employmentStatus ?? "在职"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        employmentStatus:
                          (v as "在职" | "离职") ?? "在职",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="在职">在职</SelectItem>
                      <SelectItem value="离职">离职</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "提交中..." : isEdit ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

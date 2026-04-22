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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { WindowDaysPicker } from "@/components/window-days-picker";
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
  // 从在职切到离职时必填，编辑模式以外忽略
  offboardReason?: string;
  exerciseWindowDays?: number;
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

  const isOffboardingNow =
    mode === "edit" &&
    form.employmentStatus === "离职" &&
    initialValue?.employmentStatus === "在职";

  async function handleSubmit() {
    setError(null);
    if (!form.name.trim()) return setError("员工姓名必填");
    if (mode === "create" && !form.employeeId.trim())
      return setError("员工 ID 必填");
    if (mode === "create" && !form.email.trim())
      return setError("邮箱必填");
    if (isOffboardingNow) {
      if (!form.offboardReason || !form.offboardReason.trim())
        return setError("设为离职需填写关闭原因");
      if (form.exerciseWindowDays === undefined)
        return setError("设为离职需选择行权窗口期");
    }

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
                  <NativeSelect
                    value={form.legalIdentity}
                    onChange={(v) =>
                      setForm({ ...form, legalIdentity: v as Jurisdiction })
                    }
                    options={JURISDICTION_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>税务居住地 *</Label>
                  <NativeSelect
                    value={form.taxResidence}
                    onChange={(v) =>
                      setForm({ ...form, taxResidence: v as Jurisdiction })
                    }
                    options={JURISDICTION_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
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
                  <NativeSelect
                    value={form.employmentStatus ?? "在职"}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        employmentStatus: v as "在职" | "离职",
                      })
                    }
                    options={[
                      { value: "在职", label: "在职" },
                      { value: "离职", label: "离职" },
                    ]}
                  />
                </div>
              )}

              {isOffboardingNow && (
                <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">
                    设为离职会触发：所有待审批申请关闭、RSU 非 All Settled 的 Grant → Closed、Option 根据可操作期权进入 Closing 或 Closed。
                  </p>
                  <div className="space-y-1">
                    <Label>关闭原因 *</Label>
                    <Textarea
                      rows={3}
                      value={form.offboardReason ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, offboardReason: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>行权窗口期 *（仅 Option 可操作期权 &gt; 0 的 Grant 使用）</Label>
                    <WindowDaysPicker
                      value={form.exerciseWindowDays}
                      onChange={(n) =>
                        setForm({ ...form, exerciseWindowDays: n })
                      }
                    />
                  </div>
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

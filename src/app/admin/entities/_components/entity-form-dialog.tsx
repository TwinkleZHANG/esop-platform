"use client";

import { useEffect, useState } from "react";
import type { HoldingEntityType } from "@prisma/client";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TYPE_OPTIONS: { value: HoldingEntityType; label: string }[] = [
  { value: "LIMITED_PARTNERSHIP", label: "有限合伙" },
  { value: "DOMESTIC_SUBSIDIARY", label: "境内子公司" },
  { value: "OFFSHORE_SPV", label: "境外SPV" },
  { value: "OTHER", label: "其他" },
];

export interface EntityFormValue {
  name: string;
  entityCode: string;
  type: HoldingEntityType;
  registrationNo: string;
  address: string;
  establishedAt: string;
  legalRep: string;
  lpAccount: string;
  taxJurisdiction: "内地" | "香港" | "海外";
  notes: string;
  status?: "ACTIVE" | "INACTIVE";
}

const DEFAULT_VALUE: EntityFormValue = {
  name: "",
  entityCode: "",
  type: "LIMITED_PARTNERSHIP",
  registrationNo: "",
  address: "",
  establishedAt: "",
  legalRep: "",
  lpAccount: "",
  taxJurisdiction: "内地",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initialValue?: EntityFormValue;
  onSubmit: (v: EntityFormValue) => Promise<void>;
}

export function EntityFormDialog({
  open,
  onOpenChange,
  mode,
  initialValue,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<EntityFormValue>(
    initialValue ?? DEFAULT_VALUE
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialValue ?? DEFAULT_VALUE);
      setError(null);
    }
  }, [open, initialValue]);

  async function handleSubmit() {
    setError(null);
    if (!form.name.trim()) return setError("代持主体必填");
    if (mode === "create" && !form.entityCode.trim())
      return setError("代持主体 ID 必填");
    if (!form.registrationNo.trim())
      return setError("主体代码编号必填");

    setSubmitting(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
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
          <DialogTitle>
            {isEdit ? "编辑持股主体" : "添加持股主体"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>代持主体 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>代持主体 ID *</Label>
              <Input
                disabled={isEdit}
                value={form.entityCode}
                onChange={(e) =>
                  setForm({ ...form, entityCode: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>持股主体类型 *</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    type:
                      (v as HoldingEntityType) ?? "LIMITED_PARTNERSHIP",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>税务属地 *</Label>
              <Select
                value={form.taxJurisdiction}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    taxJurisdiction:
                      (v as "内地" | "香港" | "海外") ?? "内地",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="内地">内地</SelectItem>
                  <SelectItem value="香港">香港</SelectItem>
                  <SelectItem value="海外">海外</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>主体代码编号 *</Label>
            <Input
              value={form.registrationNo}
              onChange={(e) =>
                setForm({ ...form, registrationNo: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>注册地址</Label>
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>成立时间</Label>
              <Input
                type="date"
                value={form.establishedAt}
                onChange={(e) =>
                  setForm({ ...form, establishedAt: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>法人代表/负责人</Label>
              <Input
                value={form.legalRep}
                onChange={(e) =>
                  setForm({ ...form, legalRep: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>LP 份额账户</Label>
              <Input
                value={form.lpAccount}
                onChange={(e) =>
                  setForm({ ...form, lpAccount: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {isEdit && (
            <div className="space-y-1">
              <Label>状态</Label>
              <Select
                value={form.status ?? "ACTIVE"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    status: (v as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">启用</SelectItem>
                  <SelectItem value="INACTIVE">停用</SelectItem>
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
      </DialogContent>
    </Dialog>
  );
}

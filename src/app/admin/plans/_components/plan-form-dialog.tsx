"use client";

import { useEffect, useState } from "react";
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
import { NativeSelect } from "@/components/ui/native-select";

const RSU_DELIVERY: { value: "SHARES" | "LP_SHARES" | "OFFSHORE_SPV"; label: string }[] = [
  { value: "SHARES", label: "实股" },
  { value: "LP_SHARES", label: "LP份额" },
  { value: "OFFSHORE_SPV", label: "境外SPV股份" },
];

export interface PlanFormValue {
  id?: string;
  title: string;
  type: "RSU" | "OPTION";
  jurisdiction: "内地" | "香港" | "海外";
  deliveryMethods: ("SHARES" | "LP_SHARES" | "OFFSHORE_SPV")[];
  poolSize: string;
  effectiveDate: string; // yyyy-mm-dd
  boardResolutionId: string;
  notes: string;
}

const DEFAULT_VALUE: PlanFormValue = {
  title: "",
  type: "RSU",
  jurisdiction: "内地",
  deliveryMethods: [],
  poolSize: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  boardResolutionId: "",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValue?: PlanFormValue;
  mode: "create" | "edit";
  onSubmit: (v: PlanFormValue) => Promise<void>;
}

export function PlanFormDialog({
  open,
  onOpenChange,
  initialValue,
  mode,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PlanFormValue>(
    initialValue ?? DEFAULT_VALUE
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialValue ?? DEFAULT_VALUE);
      setError(null);
    }
  }, [open, initialValue]);

  function toggleDelivery(v: "SHARES" | "LP_SHARES" | "OFFSHORE_SPV") {
    setForm((f) => ({
      ...f,
      deliveryMethods: f.deliveryMethods.includes(v)
        ? f.deliveryMethods.filter((x) => x !== v)
        : [...f.deliveryMethods, v],
    }));
  }

  async function handleSubmit() {
    setError(null);
    if (!form.title.trim()) return setError("计划标题必填");
    if (!form.poolSize || Number(form.poolSize) <= 0)
      return setError("激励池规模必须大于 0");
    if (form.type === "RSU" && form.deliveryMethods.length === 0)
      return setError("RSU 必须选择至少一种交割方式");

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

  const canEditType = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "创建计划" : "编辑计划"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>计划标题 *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>激励类型 *</Label>
              <NativeSelect
                value={form.type}
                onChange={(v) =>
                  setForm({
                    ...form,
                    type: v as "RSU" | "OPTION",
                    deliveryMethods: [],
                  })
                }
                disabled={!canEditType}
                options={[
                  { value: "RSU", label: "RSU" },
                  { value: "OPTION", label: "Option" },
                ]}
              />
            </div>

            <div className="space-y-1">
              <Label>适用法域 *</Label>
              <NativeSelect
                value={form.jurisdiction}
                onChange={(v) =>
                  setForm({
                    ...form,
                    jurisdiction: v as "内地" | "香港" | "海外",
                  })
                }
                options={[
                  { value: "内地", label: "内地" },
                  { value: "香港", label: "香港" },
                  { value: "海外", label: "海外" },
                ]}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>交割方式 *</Label>
            {form.type === "OPTION" ? (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                购买实股的权利（Option 固定）
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {RSU_DELIVERY.map((d) => (
                  <label
                    key={d.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.deliveryMethods.includes(d.value)}
                      onChange={() => toggleDelivery(d.value)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>激励池规模 *</Label>
              <Input
                type="number"
                step="0.00000001"
                value={form.poolSize}
                onChange={(e) =>
                  setForm({ ...form, poolSize: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>生效日期 *</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) =>
                  setForm({ ...form, effectiveDate: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>董事会决议文件ID</Label>
            <Input
              value={form.boardResolutionId}
              onChange={(e) =>
                setForm({ ...form, boardResolutionId: e.target.value })
              }
            />
          </div>

          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>

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
            {submitting ? "提交中..." : mode === "create" ? "创建" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

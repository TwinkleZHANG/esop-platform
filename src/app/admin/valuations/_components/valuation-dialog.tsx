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

export interface ValuationFormValue {
  valuationDate: string;
  fmv: string;
  source: string;
  description: string;
}

const DEFAULT: ValuationFormValue = {
  valuationDate: new Date().toISOString().slice(0, 10),
  fmv: "",
  source: "",
  description: "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: ValuationFormValue) => Promise<void>;
}

export function ValuationDialog({ open, onOpenChange, onSubmit }: Props) {
  const [form, setForm] = useState<ValuationFormValue>(DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT);
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    setError(null);
    if (!form.valuationDate) return setError("估值日期必填");
    if (!form.fmv || Number(form.fmv) <= 0)
      return setError("FMV 必须大于 0");

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>添加估值记录</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>估值日期 *</Label>
            <Input
              type="date"
              value={form.valuationDate}
              onChange={(e) =>
                setForm({ ...form, valuationDate: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>FMV 公允价值（港币）*</Label>
            <Input
              type="number"
              step="0.00000001"
              value={form.fmv}
              onChange={(e) => setForm({ ...form, fmv: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>估值来源</Label>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="如第三方评估机构、内部评估等"
            />
          </div>
          <div className="space-y-1">
            <Label>描述</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
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
            {submitting ? "提交中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

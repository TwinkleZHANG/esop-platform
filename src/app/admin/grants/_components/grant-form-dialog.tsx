"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";

interface PlanOption {
  id: string;
  title: string;
  type: "RSU" | "OPTION";
  jurisdiction: string;
  poolSize: string;
}
interface EmployeeOption {
  id: string;
  name: string;
  employeeId: string;
  department: string | null;
}
interface EntityOption {
  id: string;
  name: string;
  entityCode: string;
}

interface Options {
  plans: PlanOption[];
  employees: EmployeeOption[];
  entities: EntityOption[];
}

export interface GrantFormValue {
  planId: string;
  userId: string;
  holdingEntityId: string | null;
  grantDate: string;
  vestingStartDate: string;
  totalQuantity: string;
  strikePrice: string;
  agreementId: string;
  vestingYears: number;
  cliffMonths: number;
  vestingFrequency: "MONTHLY" | "YEARLY";
}

const DEFAULT: GrantFormValue = {
  planId: "",
  userId: "",
  holdingEntityId: null,
  grantDate: new Date().toISOString().slice(0, 10),
  vestingStartDate: "",
  totalQuantity: "",
  strikePrice: "",
  agreementId: "",
  vestingYears: 4,
  cliffMonths: 12,
  vestingFrequency: "MONTHLY",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: GrantFormValue) => Promise<void>;
}

export function GrantFormDialog({ open, onOpenChange, onSubmit }: Props) {
  const [form, setForm] = useState<GrantFormValue>(DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/grants/options");
    const json = await res.json();
    if (json.success) setOptions(json.data);
  }, []);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT);
      setError(null);
      void load();
    }
  }, [open, load]);

  const selectedPlan = options?.plans.find((p) => p.id === form.planId);
  const isRSU = selectedPlan?.type === "RSU";

  const planOptions: SearchableOption[] = (options?.plans ?? []).map((p) => ({
    value: p.id,
    label: p.title,
    description: `${p.type} · ${p.jurisdiction} · 池 ${p.poolSize}`,
  }));
  const employeeOptions: SearchableOption[] = (options?.employees ?? []).map(
    (u) => ({
      value: u.id,
      label: u.name,
      description: `${u.employeeId}${u.department ? ` · ${u.department}` : ""}`,
    })
  );
  const entityOptions: SearchableOption[] = (options?.entities ?? []).map(
    (e) => ({
      value: e.id,
      label: e.name,
      description: e.entityCode,
    })
  );

  async function handleSubmit() {
    setError(null);
    if (!form.planId) return setError("请选择计划");
    if (!form.userId) return setError("请选择员工");
    if (!form.totalQuantity || Number(form.totalQuantity) <= 0)
      return setError("授予数量必须为大于 0 的整数");
    if (!Number.isInteger(Number(form.totalQuantity)))
      return setError("授予数量必须为整数");
    if (!isRSU) {
      if (!form.strikePrice || Number(form.strikePrice) <= 0)
        return setError("Option 行权价必填且大于 0");
    }

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>创建授予</DialogTitle>
        </DialogHeader>

        {!options ? (
          <div className="text-sm text-muted-foreground">加载下拉数据...</div>
        ) : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">基本信息</h3>

              <div className="space-y-1">
                <Label>计划 *</Label>
                <SearchableSelect
                  value={form.planId || null}
                  onChange={(v) => setForm({ ...form, planId: v ?? "" })}
                  options={planOptions}
                  placeholder="按计划标题搜索"
                  emptyText="无已通过的计划"
                />
              </div>

              <div className="space-y-1">
                <Label>员工 *</Label>
                <SearchableSelect
                  value={form.userId || null}
                  onChange={(v) => setForm({ ...form, userId: v ?? "" })}
                  options={employeeOptions}
                  placeholder="按姓名或员工 ID 搜索"
                  emptyText="无在职员工"
                />
              </div>

              <div className="space-y-1">
                <Label>持股主体</Label>
                <SearchableSelect
                  value={form.holdingEntityId}
                  onChange={(v) =>
                    setForm({ ...form, holdingEntityId: v })
                  }
                  options={entityOptions}
                  placeholder="按名称或代码搜索"
                  emptyText="无启用的持股主体"
                  allowClear
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>授予日期 *</Label>
                  <Input
                    type="date"
                    value={form.grantDate}
                    onChange={(e) =>
                      setForm({ ...form, grantDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>授予计划开始日期</Label>
                  <input
                    type="date"
                    value={form.vestingStartDate ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        vestingStartDate: e.target.value,
                      })
                    }
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    留空则默认等于授予日期
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">授予详情</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>授予数量 *</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={form.totalQuantity}
                    onChange={(e) =>
                      setForm({ ...form, totalQuantity: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>行权价 {isRSU ? "(RSU 固定为 0)" : "*"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={isRSU ? "0" : form.strikePrice}
                    disabled={isRSU}
                    onChange={(e) =>
                      setForm({ ...form, strikePrice: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>协议 ID（选填，进入 Granted 状态前必须补齐）</Label>
                <Input
                  value={form.agreementId}
                  onChange={(e) =>
                    setForm({ ...form, agreementId: e.target.value })
                  }
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">归属计划</h3>
              <div className="grid grid-cols-3 gap-3">
                <YearsPicker
                  value={form.vestingYears}
                  onChange={(n) => setForm({ ...form, vestingYears: n })}
                />
                <CliffPicker
                  value={form.cliffMonths}
                  onChange={(n) => setForm({ ...form, cliffMonths: n })}
                />
                <div className="space-y-1">
                  <Label>归属频率 *</Label>
                  <NativeSelect
                    value={form.vestingFrequency}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        vestingFrequency: v as "MONTHLY" | "YEARLY",
                      })
                    }
                    options={[
                      { value: "MONTHLY", label: "按月" },
                      { value: "YEARLY", label: "按年" },
                    ]}
                  />
                </div>
              </div>
            </section>

            {selectedPlan && (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                提示：选中计划「{selectedPlan.title}」激励池 {selectedPlan.poolSize}。
                创建时系统会校验已授予 + 本次 ≤ 池规模。
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !options}>
            {submitting ? "提交中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PRESET_YEARS = [1, 2, 3, 4, 5];
const PRESET_CLIFF = [0, 6, 12, 18, 24];

function YearsPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const isCustom = !PRESET_YEARS.includes(value);
  const [custom, setCustom] = useState(isCustom);
  return (
    <div className="space-y-1">
      <Label>归属年限 *</Label>
      <NativeSelect
        value={custom ? "CUSTOM" : String(value)}
        onChange={(v) => {
          if (v === "CUSTOM") {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(Number(v));
          }
        }}
        options={[
          ...PRESET_YEARS.map((n) => ({
            value: String(n),
            label: `${n} 年`,
          })),
          { value: "CUSTOM", label: "自定义" },
        ]}
      />
      {custom && (
        <Input
          type="number"
          min="1"
          step="1"
          placeholder="年"
          value={isCustom ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n > 0) onChange(n);
          }}
        />
      )}
    </div>
  );
}

function CliffPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const isCustom = !PRESET_CLIFF.includes(value);
  const [custom, setCustom] = useState(isCustom);
  return (
    <div className="space-y-1">
      <Label>悬崖期 *</Label>
      <NativeSelect
        value={custom ? "CUSTOM" : String(value)}
        onChange={(v) => {
          if (v === "CUSTOM") {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(Number(v));
          }
        }}
        options={[
          ...PRESET_CLIFF.map((n) => ({
            value: String(n),
            label: `${n}个月`,
          })),
          { value: "CUSTOM", label: "自定义" },
        ]}
      />
      {custom && (
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="个月"
          value={isCustom ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 0) onChange(n);
          }}
        />
      )}
    </div>
  );
}

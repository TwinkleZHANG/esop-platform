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

interface GrantInitial {
  id: string;
  plan: { type: "RSU" | "OPTION" };
  holdingEntity: { id: string; name: string } | null;
  grantDate: string;
  vestingStartDate: string | null;
  totalQuantity: string;
  strikePrice: string;
  agreementId: string | null;
  vestingYears: number;
  cliffMonths: number;
  vestingFrequency: "MONTHLY" | "YEARLY";
}

interface EntityOpt {
  id: string;
  name: string;
  entityCode: string;
}

const PRESET_YEARS = [1, 2, 3, 4, 5];
const PRESET_CLIFF = [0, 6, 12, 18, 24];

export function EditDraftDialog({
  open,
  onOpenChange,
  grantId,
  initial,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grantId: string;
  initial: GrantInitial;
  onDone: () => Promise<void>;
}) {
  const isRSU = initial.plan.type === "RSU";
  const [entities, setEntities] = useState<EntityOpt[]>([]);
  const [holdingEntityId, setHoldingEntityId] = useState<string | null>(
    initial.holdingEntity?.id ?? null
  );
  const [grantDate, setGrantDate] = useState(initial.grantDate.slice(0, 10));
  const [vestingStartDate, setVestingStartDate] = useState(
    initial.vestingStartDate ? initial.vestingStartDate.slice(0, 10) : ""
  );
  const [totalQuantity, setTotalQuantity] = useState(initial.totalQuantity);
  const [strikePrice, setStrikePrice] = useState(initial.strikePrice);
  const [agreementId, setAgreementId] = useState(initial.agreementId ?? "");
  const [vestingYears, setVestingYears] = useState(initial.vestingYears);
  const [cliffMonths, setCliffMonths] = useState(initial.cliffMonths);
  const [vestingFrequency, setVestingFrequency] = useState<"MONTHLY" | "YEARLY">(
    initial.vestingFrequency
  );
  const [customYears, setCustomYears] = useState(
    !PRESET_YEARS.includes(initial.vestingYears)
  );
  const [customCliff, setCustomCliff] = useState(
    !PRESET_CLIFF.includes(initial.cliffMonths)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    const res = await fetch("/api/grants/options");
    const json = await res.json();
    if (json.success) setEntities(json.data.entities);
  }, []);

  useEffect(() => {
    if (open) {
      setHoldingEntityId(initial.holdingEntity?.id ?? null);
      setGrantDate(initial.grantDate.slice(0, 10));
      setVestingStartDate(
        initial.vestingStartDate ? initial.vestingStartDate.slice(0, 10) : ""
      );
      setTotalQuantity(initial.totalQuantity);
      setStrikePrice(initial.strikePrice);
      setAgreementId(initial.agreementId ?? "");
      setVestingYears(initial.vestingYears);
      setCliffMonths(initial.cliffMonths);
      setVestingFrequency(initial.vestingFrequency);
      setCustomYears(!PRESET_YEARS.includes(initial.vestingYears));
      setCustomCliff(!PRESET_CLIFF.includes(initial.cliffMonths));
      setError(null);
      void loadOptions();
    }
  }, [open, initial, loadOptions]);

  const entityOptions: SearchableOption[] = entities.map((e) => ({
    value: e.id,
    label: e.name,
    description: e.entityCode,
  }));

  async function submit() {
    setError(null);
    if (!totalQuantity || Number(totalQuantity) <= 0)
      return setError("授予数量必须为大于 0 的整数");
    if (!Number.isInteger(Number(totalQuantity)))
      return setError("授予数量必须为整数");
    if (!isRSU && (!strikePrice || Number(strikePrice) <= 0))
      return setError("Option 行权价必填且大于 0");

    setBusy(true);
    const res = await fetch(`/api/grants/${grantId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdingEntityId,
        grantDate,
        vestingStartDate: vestingStartDate || null,
        totalQuantity,
        strikePrice: isRSU ? 0 : strikePrice,
        agreementId: agreementId || null,
        vestingYears,
        cliffMonths,
        vestingFrequency,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "保存失败");
      return;
    }
    await onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑草稿</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>持股主体</Label>
            <SearchableSelect
              value={holdingEntityId}
              onChange={setHoldingEntityId}
              options={entityOptions}
              placeholder="请选择持股主体"
              emptyText="无启用的持股主体"
              allowClear
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>授予日期 *</Label>
              <Input
                type="date"
                value={grantDate}
                onChange={(e) => setGrantDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>归属开始日期</Label>
              <Input
                type="date"
                value={vestingStartDate}
                onChange={(e) => setVestingStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                留空则默认等于授予日期
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>授予数量 *</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>行权价 {isRSU ? "(RSU 固定为 0)" : "*"}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={isRSU ? "0" : strikePrice}
                disabled={isRSU}
                onChange={(e) => setStrikePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>协议 ID</Label>
            <Input
              value={agreementId}
              onChange={(e) => setAgreementId(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>归属年限 *</Label>
              <NativeSelect
                value={customYears ? "CUSTOM" : String(vestingYears)}
                onChange={(v) => {
                  if (v === "CUSTOM") setCustomYears(true);
                  else {
                    setCustomYears(false);
                    setVestingYears(Number(v));
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
              {customYears && (
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="年"
                  value={vestingYears}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n > 0) setVestingYears(n);
                  }}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>悬崖期 *</Label>
              <NativeSelect
                value={customCliff ? "CUSTOM" : String(cliffMonths)}
                onChange={(v) => {
                  if (v === "CUSTOM") setCustomCliff(true);
                  else {
                    setCustomCliff(false);
                    setCliffMonths(Number(v));
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
              {customCliff && (
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="个月"
                  value={cliffMonths}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 0) setCliffMonths(n);
                  }}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>归属频率 *</Label>
              <NativeSelect
                value={vestingFrequency}
                onChange={(v) =>
                  setVestingFrequency(v as "MONTHLY" | "YEARLY")
                }
                options={[
                  { value: "MONTHLY", label: "按月" },
                  { value: "YEARLY", label: "按年" },
                ]}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

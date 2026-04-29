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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

interface GrantSummary {
  id: string;
  planType: "RSU" | "OPTION";
  planTitle: string;
  operableShares: string;
  operableOptions: string;
  /** 行权期/关闭窗口已过 → 期权目标禁用，仅可对实股操作 */
  optionsLocked?: boolean;
}

interface Props {
  grant: GrantSummary | null;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

type Target = "OPTIONS" | "SHARES";
type RequestType = "EXERCISE" | "TRANSFER" | "SELL" | "BUYBACK" | "REDEEM";

const OPTION_ACTIONS_FOR_OPTIONS: { value: RequestType; label: string }[] = [
  { value: "EXERCISE", label: "行权" },
  { value: "TRANSFER", label: "转让" },
  { value: "BUYBACK", label: "回购" },
  { value: "REDEEM", label: "兑现" },
];

const ACTIONS_FOR_SHARES: { value: RequestType; label: string }[] = [
  { value: "SELL", label: "售出" },
  { value: "TRANSFER", label: "转让" },
  { value: "BUYBACK", label: "回购" },
  { value: "REDEEM", label: "兑现" },
];

export function RequestDialog({ grant, onClose, onSubmitted }: Props) {
  const [target, setTarget] = useState<Target>("OPTIONS");
  const [requestType, setRequestType] = useState<RequestType>("EXERCISE");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!grant) return;
    setError(null);
    setQuantity("");
    setNotes("");
    if (grant.planType === "RSU") {
      setTarget("SHARES");
      setRequestType("SELL");
    } else {
      // Option 默认先选期权，若无可操作期权或期权目标已锁定则改为实股
      const hasOpts = Number(grant.operableOptions) > 0;
      const hasShares = Number(grant.operableShares) > 0;
      if (hasOpts && !grant.optionsLocked) {
        setTarget("OPTIONS");
        setRequestType("EXERCISE");
      } else if (hasShares) {
        setTarget("SHARES");
        setRequestType("SELL");
      } else {
        setTarget("OPTIONS");
        setRequestType("EXERCISE");
      }
    }
  }, [grant]);

  if (!grant) return null;

  const isOption = grant.planType === "OPTION";
  const effectiveTarget: Target = isOption ? target : "SHARES";
  const limit =
    effectiveTarget === "OPTIONS" ? grant.operableOptions : grant.operableShares;
  const actionOptions = isOption
    ? effectiveTarget === "OPTIONS"
      ? OPTION_ACTIONS_FOR_OPTIONS
      : ACTIONS_FOR_SHARES
    : ACTIONS_FOR_SHARES;

  async function submit() {
    if (!grant) return;
    setError(null);
    const n = Number(quantity);
    if (!quantity || !Number.isInteger(n) || n <= 0) {
      return setError("请填写大于 0 的整数数量");
    }
    if (n > Number(limit)) {
      return setError(`数量超过可操作上限 ${limit}`);
    }

    setBusy(true);
    const res = await fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: grant.id,
        requestType,
        // RSU 不发 target（服务端默认按 SHARES 处理）；Option 才区分
        ...(isOption ? { requestTarget: effectiveTarget } : {}),
        quantity: n,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "提交失败");
      return;
    }
    // 备注暂存到本地（当前 API 未落库备注），此处不阻断
    void notes;
    await onSubmitted();
    onClose();
  }

  return (
    <Dialog open={!!grant} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>提交申请 · {grant.planTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isOption ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/50 p-3 text-sm">
              <div>
                已归属未行权的期权 — 可操作{" "}
                <span className="font-semibold">{grant.operableOptions}</span> 份
              </div>
              <div>
                已行权的实股 — 可操作{" "}
                <span className="font-semibold">{grant.operableShares}</span> 股
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
              可操作实股：
              <span className="font-semibold">{grant.operableShares}</span> 股
            </div>
          )}

          {isOption && (
            <div className="space-y-1">
              <Label>操作目标 *</Label>
              <div className="flex gap-3 text-sm">
                <label
                  className={
                    "flex items-center gap-2 " +
                    (grant.optionsLocked
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer")
                  }
                >
                  <input
                    type="radio"
                    checked={target === "OPTIONS"}
                    disabled={grant.optionsLocked}
                    onChange={() => {
                      setTarget("OPTIONS");
                      setRequestType("EXERCISE");
                    }}
                  />
                  期权
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={target === "SHARES"}
                    onChange={() => {
                      setTarget("SHARES");
                      setRequestType("SELL");
                    }}
                  />
                  实股
                </label>
              </div>
              {grant.optionsLocked && (
                <p className="text-xs text-muted-foreground">
                  行权期已到期，仅可对实股操作
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>申请操作 *</Label>
            <NativeSelect
              value={requestType}
              onChange={(v) => setRequestType(v as RequestType)}
              options={actionOptions}
            />
          </div>

          <div className="space-y-1">
            <Label>申请数量 *（上限 {limit}）</Label>
            <Input
              type="number"
              step="1"
              min="1"
              max={limit}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="（选填）"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "提交中..." : "确认提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

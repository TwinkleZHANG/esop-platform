"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  OperationTarget,
  TaxEventStatus,
  TaxEventType,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  TAX_EVENT_STATUS_LABEL,
  TAX_EVENT_STATUS_TONE,
  TAX_EVENT_TYPE_LABEL,
} from "@/lib/i18n";

interface Detail {
  id: string;
  eventType: TaxEventType;
  operationType: string;
  operationTarget: OperationTarget | null;
  quantity: string;
  eventDate: string;
  fmvAtEvent: string;
  strikePrice: string;
  status: TaxEventStatus;
  receiptFiles: string[];
  employeeNotes: string | null;
  user: { id: string; name: string; employeeId: string; email: string };
  grant: {
    id: string;
    plan: { id: string; title: string; type: "RSU" | "OPTION" };
  };
  operationRequest: {
    id: string;
    requestType: string;
    requestTarget: OperationTarget | null;
  } | null;
  valuation: { id: string; valuationDate: string; fmv: string } | null;
  vestingRecord: { id: string; vestingDate: string } | null;
}

interface Props {
  taxEventId: string | null;
  onClose: () => void;
  canConfirm: boolean;
  onConfirmed: () => Promise<void>;
}

export function TaxEventDetailDialog({
  taxEventId,
  onClose,
  canConfirm,
  onConfirmed,
}: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!taxEventId) return;
    setError(null);
    const res = await fetch(`/api/tax-events/${taxEventId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setDetail(json.data);
  }, [taxEventId]);

  useEffect(() => {
    if (taxEventId) void load();
    else setDetail(null);
  }, [taxEventId, load]);

  async function confirm() {
    if (!detail) return;
    if (!window.confirm("确认该税务事件？确认后将触发 Grant 状态和可操作字段更新，不可撤销")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/tax-events/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "确认失败");
      return;
    }
    await onConfirmed();
    onClose();
  }

  return (
    <Dialog open={!!taxEventId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>税务事件详情</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!detail && !error && (
          <p className="text-sm text-muted-foreground">加载中...</p>
        )}

        {detail && (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <StatusBadge tone={TAX_EVENT_STATUS_TONE[detail.status]}>
                {TAX_EVENT_STATUS_LABEL[detail.status]}
              </StatusBadge>
              <span className="text-sm text-muted-foreground">
                {TAX_EVENT_TYPE_LABEL[detail.eventType]} · {detail.operationType}
              </span>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="税务事件编号" value={detail.id} />
              <Field
                label="权利 ID"
                value={detail.grant.id}
              />
              <Field label="员工" value={`${detail.user.name}（${detail.user.employeeId}）`} />
              <Field label="邮箱" value={detail.user.email} />
              <Field label="激励计划" value={detail.grant.plan.title} />
              <Field label="激励类型" value={detail.grant.plan.type} />
              <Field label="操作目标" value={
                detail.operationTarget === "SHARES"
                  ? "实股"
                  : detail.operationTarget === "OPTIONS"
                  ? "期权"
                  : "-"
              } />
              <Field label="数量" value={detail.quantity} />
              <Field
                label="触发日期"
                value={new Date(detail.eventDate).toLocaleDateString("zh-CN")}
              />
              <Field label="触发日 FMV" value={detail.fmvAtEvent} />
              <Field
                label="FMV 来源"
                value={
                  detail.valuation
                    ? `${new Date(detail.valuation.valuationDate).toLocaleDateString("zh-CN")} 估值`
                    : "-"
                }
              />
              <Field label="行权价" value={detail.strikePrice} />
              <Field
                label="关联申请"
                value={
                  detail.operationRequest ? detail.operationRequest.id : "（归属税务无关联申请）"
                }
              />
            </dl>

            <section>
              <div className="mb-2 text-sm font-semibold">员工上传凭证</div>
              {detail.receiptFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">员工尚未上传凭证</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {detail.receiptFiles.map((_, idx) => (
                    <ReceiptItem
                      key={idx}
                      taxEventId={detail.id}
                      idx={idx}
                    />
                  ))}
                </div>
              )}
            </section>

            {detail.employeeNotes && (
              <section>
                <div className="mb-2 text-sm font-semibold">员工备注</div>
                <p className="whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-sm">
                  {detail.employeeNotes}
                </p>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            关闭
          </Button>
          {canConfirm && detail?.status === "RECEIPT_UPLOADED" && (
            <Button onClick={confirm} disabled={busy}>
              {busy ? "确认中..." : "确认"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value}</dd>
    </div>
  );
}

function ReceiptItem({
  taxEventId,
  idx,
}: {
  taxEventId: string;
  idx: number;
}) {
  const url = `/api/tax-events/${taxEventId}/files/${idx}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
    >
      凭证 {idx + 1} · 查看 / 下载
    </a>
  );
}

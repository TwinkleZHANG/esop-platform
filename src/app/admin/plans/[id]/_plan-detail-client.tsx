"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { BackToListButton } from "@/components/back-to-list-button";
import { hasPermission } from "@/lib/permissions";
import {
  PlanFormDialog,
  type PlanFormValue,
} from "../_components/plan-form-dialog";

interface PlanDetail {
  id: string;
  title: string;
  type: "RSU" | "OPTION";
  jurisdiction: string;
  deliveryMethod: { methods?: string[]; label?: string };
  poolSize: string;
  effectiveDate: string;
  boardResolutionId: string | null;
  notes: string | null;
  status: "PENDING_APPROVAL" | "APPROVED";
  grantedQuantity: string;
  remainingQuantity: string;
}

const DELIVERY_LABELS: Record<string, string> = {
  SHARES: "实股",
  LP_SHARES: "LP份额",
  OFFSHORE_SPV: "境外SPV股份",
  OPTION_RIGHT: "购买实股的权利",
};

export function PlanDetailClient({ planId }: { planId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canEdit = hasPermission(role, "plan.create");
  const canApprove = hasPermission(role, "plan.approve");

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setPlan(json.data);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!plan) return <div className="text-sm text-muted-foreground">加载中...</div>;

  const isPending = plan.status === "PENDING_APPROVAL";
  const deliveryLabel =
    plan.deliveryMethod?.methods
      ?.map((m) => DELIVERY_LABELS[m] ?? m)
      .join(" / ") ?? "-";

  async function handleEdit(v: PlanFormValue) {
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: v.title,
        jurisdiction: v.jurisdiction,
        deliveryMethods: v.deliveryMethods,
        poolSize: v.poolSize,
        effectiveDate: v.effectiveDate,
        boardResolutionId: v.boardResolutionId || null,
        notes: v.notes || null,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "保存失败");
    await load();
  }

  async function handleApprove() {
    if (!confirm("确定审批通过该计划？通过后不可再修改")) return;
    setBusy(true);
    const res = await fetch(`/api/plans/${planId}`, { method: "PATCH" });
    const json = await res.json();
    setBusy(false);
    if (!json.success) {
      setError(json.error ?? "审批失败");
      return;
    }
    await load();
  }

  const formValue: PlanFormValue = {
    id: plan.id,
    title: plan.title,
    type: plan.type,
    jurisdiction: plan.jurisdiction as "内地" | "香港" | "海外",
    deliveryMethods:
      plan.type === "RSU"
        ? (plan.deliveryMethod?.methods ?? []).filter((m): m is "SHARES" | "LP_SHARES" | "OFFSHORE_SPV" =>
            ["SHARES", "LP_SHARES", "OFFSHORE_SPV"].includes(m)
          )
        : [],
    poolSize: plan.poolSize,
    effectiveDate: plan.effectiveDate.slice(0, 10),
    boardResolutionId: plan.boardResolutionId ?? "",
    notes: plan.notes ?? "",
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <BackToListButton />
          <h1 className="min-w-0 max-w-full break-words text-xl font-semibold">
            {plan.title}
          </h1>
          {isPending ? (
            <StatusBadge tone="warn">审批中</StatusBadge>
          ) : (
            <StatusBadge tone="success">已通过</StatusBadge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && isPending && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          )}
          {canApprove && isPending && (
            <Button onClick={handleApprove} disabled={busy}>
              {busy ? "处理中..." : "审批通过"}
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-border bg-background p-6 text-sm sm:grid-cols-2">
        <Field label="计划ID" value={plan.id} />
        <Field label="激励类型" value={plan.type} />
        <Field label="适用法域" value={plan.jurisdiction} />
        <Field label="交割方式" value={deliveryLabel} />
        <Field label="激励池规模" value={plan.poolSize} />
        <Field label="已授予数量" value={plan.grantedQuantity} />
        <Field label="剩余额度" value={plan.remainingQuantity} />
        <Field
          label="生效日期"
          value={new Date(plan.effectiveDate).toLocaleDateString("zh-CN")}
        />
        <Field
          label="董事会决议文件ID"
          value={plan.boardResolutionId || "-"}
        />
        <Field label="备注" value={plan.notes || "-"} />
      </dl>

      <PlanFormDialog
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
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { HoldingEntity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { BackToListButton } from "@/components/back-to-list-button";
import { hasPermission } from "@/lib/permissions";
import {
  EntityFormDialog,
  type EntityFormValue,
  TYPE_OPTIONS,
} from "../_components/entity-form-dialog";

const TYPE_LABEL = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<string, string>;

export function EntityDetailClient({ entityId }: { entityId: string }) {
  const { data: session } = useSession();
  const canEdit = hasPermission(session?.user?.role, "holdingEntity.create");

  const [entity, setEntity] = useState<HoldingEntity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/entities/${entityId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setEntity(json.data);
  }, [entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!entity)
    return <div className="text-sm text-muted-foreground">加载中...</div>;

  async function handleUpdate(v: EntityFormValue) {
    const res = await fetch(`/api/entities/${entityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v.name,
        type: v.type,
        registrationNo: v.registrationNo,
        address: v.address || null,
        establishedAt: v.establishedAt || null,
        legalRep: v.legalRep || null,
        lpAccount: v.lpAccount || null,
        taxJurisdiction: v.taxJurisdiction,
        notes: v.notes || null,
        status: v.status,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "保存失败");
    await load();
  }

  const formValue: EntityFormValue = {
    name: entity.name,
    entityCode: entity.entityCode,
    type: entity.type,
    registrationNo: entity.registrationNo,
    address: entity.address ?? "",
    establishedAt: entity.establishedAt
      ? new Date(entity.establishedAt).toISOString().slice(0, 10)
      : "",
    legalRep: entity.legalRep ?? "",
    lpAccount: entity.lpAccount ?? "",
    taxJurisdiction: entity.taxJurisdiction as "内地" | "香港" | "海外",
    notes: entity.notes ?? "",
    status: entity.status,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <BackToListButton />
          <h1 className="min-w-0 max-w-full break-words text-xl font-semibold">
            {entity.name}
          </h1>
          {entity.status === "ACTIVE" ? (
            <StatusBadge tone="success">启用</StatusBadge>
          ) : (
            <StatusBadge tone="muted">停用</StatusBadge>
          )}
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            编辑
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-border bg-background p-6 text-sm sm:grid-cols-2">
        <Field label="代持主体 ID" value={entity.entityCode} />
        <Field label="代持主体" value={entity.name} />
        <Field
          label="持股主体类型"
          value={TYPE_LABEL[entity.type] ?? entity.type}
        />
        <Field label="税务属地" value={entity.taxJurisdiction} />
        <Field label="主体代码编号" value={entity.registrationNo} />
        <Field label="注册地址" value={entity.address ?? "-"} />
        <Field
          label="成立时间"
          value={
            entity.establishedAt
              ? new Date(entity.establishedAt).toLocaleDateString("zh-CN")
              : "-"
          }
        />
        <Field label="法人代表/负责人" value={entity.legalRep ?? "-"} />
        <Field label="LP 份额账户" value={entity.lpAccount ?? "-"} />
        <Field label="备注" value={entity.notes ?? "-"} />
      </dl>

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialValue={formValue}
        onSubmit={handleUpdate}
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

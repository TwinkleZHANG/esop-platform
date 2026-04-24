"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { GrantStatus, VestingRecordStatus } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { BackToListButton } from "@/components/back-to-list-button";
import {
  GRANT_STATUS_LABEL,
  GRANT_STATUS_TONE,
} from "@/lib/i18n";

const VESTING_LABEL: Record<VestingRecordStatus, string> = {
  PENDING: "待归属",
  VESTED: "已归属",
  PARTIALLY_SETTLED: "部分行权",
  SETTLED: "已交割",
  CLOSED: "已关闭",
};

interface Data {
  user: {
    id: string;
    name: string;
    employeeId: string;
    department: string | null;
    email: string;
    employmentStatus: string;
  };
  grants: {
    id: string;
    planTitle: string;
    planType: "RSU" | "OPTION";
    holdingEntity: { id: string; name: string } | null;
    grantDate: string;
    totalQuantity: string;
    operableShares: string;
    operableOptions: string;
    status: GrantStatus;
  }[];
  vestingRecords: {
    id: string;
    grantId: string;
    planTitle: string;
    planType: "RSU" | "OPTION";
    vestingDate: string;
    quantity: string;
    status: VestingRecordStatus;
  }[];
}

export function EmployeeAssetDetailClient({
  employeeId,
}: {
  employeeId: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/assets/${employeeId}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setData(json.data);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data) return <div className="text-sm text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackToListButton />
        <h1 className="text-xl font-semibold">{data.user.name} · 资产详情</h1>
        {data.user.employmentStatus === "在职" ? (
          <StatusBadge tone="success">在职</StatusBadge>
        ) : (
          <StatusBadge tone="danger">离职</StatusBadge>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-background p-5 text-sm sm:grid-cols-2">
        <Field label="员工 ID" value={data.user.employeeId} />
        <Field label="部门" value={data.user.department ?? "-"} />
        <Field label="邮箱" value={data.user.email} />
      </dl>

      <section className="overflow-hidden rounded-lg border border-border bg-background p-5 [&_table_td]:whitespace-nowrap [&_table_th]:whitespace-nowrap">
        <h2 className="mb-3 text-sm font-semibold">① 授予记录</h2>
        {data.grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无授予记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>计划</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>持股实体</TableHead>
                <TableHead>授予数量</TableHead>
                <TableHead>可操作股数</TableHead>
                <TableHead>可操作期权</TableHead>
                <TableHead>授予日期</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="max-w-[220px] truncate">
                    <Link
                      href={`/admin/grants/${g.id}`}
                      className="text-primary hover:underline"
                    >
                      {g.planTitle}
                    </Link>
                  </TableCell>
                  <TableCell>{g.planType}</TableCell>
                  <TableCell>{g.holdingEntity?.name ?? "-"}</TableCell>
                  <TableCell>{g.totalQuantity}</TableCell>
                  <TableCell>{g.operableShares}</TableCell>
                  <TableCell>
                    {g.planType === "RSU" ? "-" : g.operableOptions}
                  </TableCell>
                  <TableCell>
                    {new Date(g.grantDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={GRANT_STATUS_TONE[g.status]}>
                      {GRANT_STATUS_LABEL[g.status]}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-background p-5 [&_table_td]:whitespace-nowrap [&_table_th]:whitespace-nowrap">
        <h2 className="mb-3 text-sm font-semibold">② 归属记录汇总</h2>
        {data.vestingRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无归属记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>计划</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>归属日期</TableHead>
                <TableHead>归属数量</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.vestingRecords.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="max-w-[220px] truncate">
                    {v.planTitle}
                  </TableCell>
                  <TableCell>{v.planType}</TableCell>
                  <TableCell>
                    {new Date(v.vestingDate).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>{v.quantity}</TableCell>
                  <TableCell>{VESTING_LABEL[v.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
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

"use client";

import { useCallback, useEffect, useState } from "react";
import type { Jurisdiction, PlanType } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JURISDICTION_LABEL } from "@/lib/i18n";

interface Overview {
  user: {
    id: string;
    name: string;
    employeeId: string;
    department: string | null;
    legalIdentity: Jurisdiction;
    taxResidence: Jurisdiction;
    employmentStatus: string;
  };
  assets: {
    key: string;
    holdingEntityName: string | null;
    planType: PlanType;
    operableShares: string;
    operableOptions: string;
    marketValue: string;
  }[];
  valuation: { fmv: string; valuationDate: string } | null;
}

export function OverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/employee/overview");
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "加载失败");
      return;
    }
    setData(json.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data) return <div className="text-sm text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">总览</h1>

      <section className="rounded-lg border border-border bg-background p-5">
        <h2 className="mb-3 text-sm font-semibold">① 个人信息</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="员工姓名" value={data.user.name} />
          <Field label="员工 ID" value={data.user.employeeId} />
          <Field label="部门" value={data.user.department ?? "-"} />
          <Field
            label="法律身份"
            value={JURISDICTION_LABEL[data.user.legalIdentity]}
          />
          <Field
            label="税务居住地"
            value={JURISDICTION_LABEL[data.user.taxResidence]}
          />
          <Field label="雇佣状态" value={data.user.employmentStatus} />
        </dl>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-background p-5 [&_table_td]:whitespace-nowrap [&_table_th]:whitespace-nowrap">
        <h2 className="mb-3 text-sm font-semibold">② 资产汇总</h2>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-border bg-muted/50 p-3 text-sm">
          <div>
            <span className="text-muted-foreground">当前估值：</span>
            <span className="font-mono font-semibold">
              {data.valuation ? `${data.valuation.fmv} HKD` : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">估值日期：</span>
            <span>
              {data.valuation
                ? new Date(data.valuation.valuationDate).toLocaleDateString(
                    "zh-CN"
                  )
                : "—"}
            </span>
          </div>
        </div>

        {data.assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无资产数据</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>持股实体</TableHead>
                <TableHead>激励类型</TableHead>
                <TableHead>可操作股数</TableHead>
                <TableHead>可操作期权</TableHead>
                <TableHead>持股当前市值（HKD）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assets.map((a) => (
                <TableRow key={a.key}>
                  <TableCell>{a.holdingEntityName ?? "-"}</TableCell>
                  <TableCell>{a.planType}</TableCell>
                  <TableCell>{a.operableShares}</TableCell>
                  <TableCell>
                    {a.planType === "RSU" ? "-" : a.operableOptions}
                  </TableCell>
                  <TableCell className="font-mono">{a.marketValue}</TableCell>
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

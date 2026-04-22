"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface DashboardData {
  employees: { total: number; active: number };
  plans: { total: number; approved: number };
  grants: { total: number; withPendingRequests: number };
  taxEvents: { total: number; pendingConfirm: number };
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "加载失败");
        return;
      }
      setData(json.data);
    })();
  }, []);

  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">仪表盘</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="员工"
          total={data?.employees.total}
          sub={data ? `在职 ${data.employees.active}` : "..."}
          href="/admin/employees"
        />
        <StatCard
          label="激励计划"
          total={data?.plans.total}
          sub={data ? `已通过 ${data.plans.approved}` : "..."}
          href="/admin/plans"
        />
        <StatCard
          label="授予"
          total={data?.grants.total}
          sub={data ? `待处理 ${data.grants.withPendingRequests}` : "..."}
          href="/admin/grants"
        />
        <StatCard
          label="税务事件"
          total={data?.taxEvents.total}
          sub={data ? `待确认 ${data.taxEvents.pendingConfirm}` : "..."}
          href="/admin/tax-events"
        />
      </div>

      <div className="rounded-lg border border-border bg-background p-6">
        <h2 className="mb-3 text-sm font-semibold">快捷操作</h2>
        <div className="flex gap-3">
          <Link href="/admin/plans">
            <Button variant="outline">+ 创建计划</Button>
          </Link>
          <Link href="/admin/employees">
            <Button variant="outline">+ 添加员工</Button>
          </Link>
          <Link href="/admin/grants">
            <Button variant="outline">+ 创建授予</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  total,
  sub,
  href,
}: {
  label: string;
  total: number | undefined;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-background p-5 transition-colors hover:border-primary"
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold">
        {total ?? "—"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GaugeIcon,
  ClipboardListIcon,
  CalendarCheckIcon,
  FileSignatureIcon,
  ReceiptIcon,
  LogOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/employee/overview", label: "总览", icon: GaugeIcon },
  { href: "/employee/grants", label: "授予记录", icon: ClipboardListIcon },
  { href: "/employee/vesting", label: "归属详情", icon: CalendarCheckIcon },
  { href: "/employee/requests", label: "申请记录", icon: FileSignatureIcon },
  { href: "/employee/tax-records", label: "税务记录", icon: ReceiptIcon },
];

interface ClosingGrant {
  grantId: string;
  planTitle: string;
  operableOptions: string;
  deadline: string;
  daysRemaining: number;
}

interface Alerts {
  offboarded: boolean;
  closingGrants: ClosingGrant[];
}

interface Props {
  userName: string;
  children: React.ReactNode;
}

export function EmployeeShell({ userName, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<Alerts | null>(null);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/employee/alerts");
    const json = await res.json();
    if (json.success) setAlerts(json.data);
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts, pathname]);

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-background transition-[width] duration-150",
          collapsed ? "w-14" : "w-56"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          {!collapsed && (
            <span className="text-sm font-semibold">ESOP · 我的股权</span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
          >
            {collapsed ? (
              <ChevronRightIcon className="size-4" />
            ) : (
              <ChevronLeftIcon className="size-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={collapsed ? label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted",
                      active && "bg-muted font-medium"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3 text-sm">
          <span className="text-muted-foreground">
            欢迎，<span className="font-medium text-foreground">{userName}</span>
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted"
          >
            <LogOutIcon className="size-3.5" />
            退出登录
          </button>
        </header>

        {alerts && (alerts.closingGrants.length > 0) && (
          <div className="space-y-2 border-b border-orange-200 bg-orange-50 px-6 py-3">
            {alerts.offboarded ? (
              <OffboardBanner alerts={alerts} />
            ) : (
              alerts.closingGrants.map((g) => (
                <ClosingBanner key={g.grantId} grant={g} />
              ))
            )}
          </div>
        )}

        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}

function ClosingBanner({ grant }: { grant: ClosingGrant }) {
  const deadlineStr = new Date(grant.deadline).toLocaleDateString("zh-CN");
  return (
    <p className="text-sm text-orange-800">
      您有一条期权授予（
      <span className="font-medium">{grant.planTitle}</span>
      ）进入关闭流程，已归属未行权期权：
      <span className="font-semibold">{grant.operableOptions}</span> 份，必须在{" "}
      <span className="font-semibold">{deadlineStr}</span>{" "}
      前行权，逾期将自动失效。剩余{" "}
      <span className="font-semibold">{grant.daysRemaining}</span> 天。
    </p>
  );
}

function OffboardBanner({ alerts }: { alerts: Alerts }) {
  const total = alerts.closingGrants.reduce(
    (acc, g) => acc + Number(g.operableOptions),
    0
  );
  const earliest = alerts.closingGrants
    .map((g) => new Date(g.deadline).getTime())
    .sort((a, b) => a - b)[0];
  const deadlineStr = earliest
    ? new Date(earliest).toLocaleDateString("zh-CN")
    : "-";
  const daysRemaining = earliest
    ? Math.max(0, Math.ceil((earliest - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;
  return (
    <p className="text-sm text-orange-800">
      您已离职，已归属未行权期权：
      <span className="font-semibold">{total}</span> 份，必须在{" "}
      <span className="font-semibold">{deadlineStr}</span>{" "}
      前行权，逾期将自动失效。剩余{" "}
      <span className="font-semibold">{daysRemaining}</span> 天。
    </p>
  );
}

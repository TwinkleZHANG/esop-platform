"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GaugeIcon,
  ClipboardListIcon,
  CalendarCheckIcon,
  FileSignatureIcon,
  ReceiptIcon,
  LogOutIcon,
  ShieldIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BadgeKey = "pendingPaymentCount";

const NAV: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: BadgeKey;
}[] = [
  { href: "/employee/overview", label: "总览", icon: GaugeIcon },
  { href: "/employee/grants", label: "授予记录", icon: ClipboardListIcon },
  { href: "/employee/vesting", label: "归属详情", icon: CalendarCheckIcon },
  { href: "/employee/requests", label: "申请记录", icon: FileSignatureIcon },
  {
    href: "/employee/tax-records",
    label: "税务记录",
    icon: ReceiptIcon,
    badgeKey: "pendingPaymentCount",
  },
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
  pendingPaymentCount: number;
}

interface Props {
  userName: string;
  isAdmin: boolean;
  children: React.ReactNode;
}

const DISMISS_KEY = "esop:dismissedClosingAlerts";
const ALERTS_PAGE_SIZE = 3;

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(set)));
}

function recomputeDays(deadline: string): number {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function EmployeeShell({ userName, isAdmin, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [alertPage, setAlertPage] = useState(1);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/employee/alerts");
    const json = await res.json();
    if (json.success) setAlerts(json.data);
  }, []);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts, pathname]);

  // 排序 + 过滤 dismissed：days ASC，同 days 时 operableOptions DESC
  const visibleAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts.closingGrants
      .filter((g) => !dismissed.has(g.grantId))
      .map((g) => ({ ...g, days: recomputeDays(g.deadline) }))
      .sort((a, b) => {
        if (a.days !== b.days) return a.days - b.days;
        return Number(b.operableOptions) - Number(a.operableOptions);
      });
  }, [alerts, dismissed]);

  const totalPages = Math.max(
    1,
    Math.ceil(visibleAlerts.length / ALERTS_PAGE_SIZE)
  );
  const currentPage = Math.min(alertPage, totalPages);
  const pageStart = (currentPage - 1) * ALERTS_PAGE_SIZE;
  const pagedAlerts = visibleAlerts.slice(
    pageStart,
    pageStart + ALERTS_PAGE_SIZE
  );

  function dismissAlert(grantId: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(grantId);
      writeDismissed(next);
      return next;
    });
  }

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

        <nav className="flex flex-1 flex-col overflow-y-auto p-2">
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon, badgeKey }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
              const count = badgeKey && alerts ? alerts[badgeKey] : 0;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={collapsed ? label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted",
                      active && "bg-muted font-medium"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1">{label}</span>}
                    {count > 0 && (
                      <span
                        className={cn(
                          "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-5 text-white",
                          collapsed && "absolute right-1 top-1 px-1"
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {isAdmin && (
            <div className="mt-auto border-t border-border pt-2">
              <Link
                href="/admin/dashboard"
                title={collapsed ? "切换到管理视图" : undefined}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ShieldIcon className="size-4 shrink-0" />
                {!collapsed && <span>切换到管理视图</span>}
              </Link>
            </div>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3 text-sm">
          <span className="text-muted-foreground">
            欢迎，
            <span className="font-medium text-foreground">{userName}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOutIcon className="size-3.5" />
            退出登录
          </Button>
        </header>

        {visibleAlerts.length > 0 && (
          <div className="border-b border-orange-200 bg-orange-50 px-6 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-orange-800">
                行权窗口提醒（共 {visibleAlerts.length} 条）
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setAlertPage(currentPage - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setAlertPage(currentPage + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
            <ul className="space-y-1">
              {pagedAlerts.map((g) => (
                <AlertItem
                  key={g.grantId}
                  grant={g}
                  days={g.days}
                  offboarded={alerts?.offboarded ?? false}
                  onDismiss={() => dismissAlert(g.grantId)}
                />
              ))}
            </ul>
          </div>
        )}

        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}

function AlertItem({
  grant,
  days,
  offboarded,
  onDismiss,
}: {
  grant: ClosingGrant;
  days: number;
  offboarded: boolean;
  onDismiss: () => void;
}) {
  const deadlineStr = new Date(grant.deadline).toLocaleDateString("zh-CN");
  const expired = days <= 0;

  const prefix = offboarded
    ? "您已离职，"
    : "您有一条期权授予进入关闭流程，";

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm text-orange-800">
      <span>
        {prefix}
        {!offboarded && (
          <>
            <span className="font-medium">{grant.planTitle}</span>：
          </>
        )}
        已归属未行权期权：
        <span className="font-semibold">{grant.operableOptions}</span> 份，必须在{" "}
        <span className="font-semibold">{deadlineStr}</span> 前行权，
        {expired ? (
          <>
            <span className="font-semibold text-red-700">已过期</span>，该额度已失效。
          </>
        ) : (
          <>
            剩余 <span className="font-semibold">{days}</span> 天。
          </>
        )}
      </span>
      {expired && (
        <Button variant="outline" size="sm" onClick={onDismiss}>
          确认
        </Button>
      )}
    </li>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { UserIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** 对应 sidebar-badges API 的字段名；不传则不显示角标 */
  badgeKey?: "plans" | "valuations" | "grants" | "taxEvents";
}

interface Badges {
  plans: number;
  valuations: number;
  grants: number;
  taxEvents: number;
}

export function AdminSidebar({
  businessNav,
  systemNav,
  showSystem,
}: {
  businessNav: NavItem[];
  systemNav: NavItem[];
  showSystem: boolean;
}) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>({
    plans: 0,
    valuations: 0,
    grants: 0,
    taxEvents: 0,
  });

  const loadBadges = useCallback(async () => {
    const res = await fetch("/api/sidebar-badges");
    const json = await res.json();
    if (json.success) setBadges(json.data);
  }, []);

  // 首次挂载 + 路径变化时刷新（PRD 9.4：关键操作后更新）
  useEffect(() => {
    void loadBadges();
  }, [loadBadges, pathname]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-4 py-4 text-sm font-semibold">
        ESOP · 管理端
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {businessNav.map((item) => (
            <NavRow key={item.href} item={item} badges={badges} />
          ))}
        </ul>
      </nav>

      {showSystem && (
        <div className="border-t border-border p-2">
          <div className="px-3 py-1 text-xs text-muted-foreground">
            系统设置
          </div>
          <ul className="space-y-1">
            {systemNav.map((item) => (
              <NavRow key={item.href} item={item} badges={badges} />
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border p-2">
        <Link
          href="/employee/overview"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <UserIcon className="size-4" />
          <span>切换到员工视图</span>
        </Link>
      </div>
    </aside>
  );
}

function NavRow({ item, badges }: { item: NavItem; badges: Badges }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const count = item.badgeKey ? badges[item.badgeKey] : 0;

  return (
    <li>
      <Link
        href={item.href}
        className={
          "flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted" +
          (active ? " bg-muted font-medium" : "")
        }
      >
        <span>{item.label}</span>
        {count > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-5 text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </li>
  );
}

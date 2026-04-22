import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";

const BUSINESS_NAV = [
  { href: "/admin/dashboard", label: "仪表盘" },
  { href: "/admin/plans", label: "激励计划池" },
  { href: "/admin/employees", label: "员工档案" },
  { href: "/admin/holding-entities", label: "持股主体库" },
  { href: "/admin/valuations", label: "估值管理" },
  { href: "/admin/grants", label: "授予管理" },
  { href: "/admin/tax-events", label: "税务事件单" },
  { href: "/admin/assets", label: "资产管理" },
];

const SYSTEM_NAV = [
  { href: "/admin/user-management", label: "用户管理" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const canSeeSystem = isSuperAdmin(session?.user?.role);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-4 text-sm font-semibold">
          ESOP · 管理端
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {BUSINESS_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {canSeeSystem && (
          <div className="border-t border-border p-2">
            <div className="px-3 py-1 text-xs text-muted-foreground">
              系统设置
            </div>
            <ul className="space-y-1">
              {SYSTEM_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}

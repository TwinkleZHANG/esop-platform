import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isEmployee, isSuperAdmin } from "@/lib/permissions";
import {
  AdminSidebar,
  type NavItem,
} from "./_components/admin-sidebar";

const BUSINESS_NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "仪表盘" },
  { href: "/admin/plans", label: "激励计划池", badgeKey: "plans" },
  { href: "/admin/employees", label: "员工档案" },
  { href: "/admin/entities", label: "持股主体库" },
  { href: "/admin/valuations", label: "估值管理", badgeKey: "valuations" },
  { href: "/admin/grants", label: "授予管理", badgeKey: "grants" },
  { href: "/admin/tax-events", label: "税务事件单", badgeKey: "taxEvents" },
  { href: "/admin/assets", label: "资产管理" },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/admin/user-management", label: "用户管理" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 兜底：中间件通常会拦住未登录请求，这里再守一道防线避免任何场景漏网
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (isEmployee(session.user.role)) redirect("/employee/overview");
  const canSeeSystem = isSuperAdmin(session.user.role);

  return (
    <div className="flex min-h-screen w-full">
      <AdminSidebar
        businessNav={BUSINESS_NAV}
        systemNav={SYSTEM_NAV}
        showSystem={canSeeSystem}
      />
      <main className="flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}

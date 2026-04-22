import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isEmployee } from "@/lib/permissions";

const NAV = [
  { href: "/employee/overview", label: "总览" },
  { href: "/employee/grants", label: "授予记录" },
  { href: "/employee/vesting", label: "归属详情" },
  { href: "/employee/requests", label: "申请记录" },
  { href: "/employee/tax-events", label: "税务记录" },
];

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (!isEmployee(session.user.role)) redirect("/admin/dashboard");

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-4 text-sm font-semibold">
          ESOP · 我的股权
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {NAV.map((item) => (
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
      </aside>

      <main className="flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}

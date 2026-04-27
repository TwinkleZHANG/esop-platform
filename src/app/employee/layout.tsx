import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { EmployeeShell } from "./_components/employee-shell";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");

  return (
    <EmployeeShell
      userName={session.user.name ?? session.user.email ?? "员工"}
      isAdmin={isAdmin(session.user.role)}
    >
      {children}
    </EmployeeShell>
  );
}

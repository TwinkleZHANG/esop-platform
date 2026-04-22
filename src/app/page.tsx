import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isEmployee } from "@/lib/permissions";

// 根路径只做分发：未登录 → /login；员工 → /employee/overview；管理员 → /admin/dashboard
export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (isEmployee(session.user.role)) {
    redirect("/employee/overview");
  }

  redirect("/admin/dashboard");
}

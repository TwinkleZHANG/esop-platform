"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ChangePasswordPage() {
  const { data: session, update, status } = useSession();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    setLoading(false);

    if (!json.success) {
      setError(json.error ?? "修改失败");
      return;
    }

    await update({ mustChangePassword: false });
    const target =
      session?.user.role === "EMPLOYEE"
        ? "/employee/overview"
        : "/admin/dashboard";
    router.push(target);
    router.refresh();
  }

  if (status === "loading") return null;
  if (!session) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-background p-6"
      >
        <div>
          <h1 className="text-lg font-semibold">修改密码</h1>
          {session.user.mustChangePassword && (
            <p className="mt-1 text-sm text-muted-foreground">
              首次登录，请先修改初始密码。
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="current" className="text-sm font-medium">
            当前密码
          </label>
          <input
            id="current"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="new" className="text-sm font-medium">
            新密码
          </label>
          <input
            id="new"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm" className="text-sm font-medium">
            确认新密码
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "提交中..." : "确认修改"}
        </Button>
      </form>
    </div>
  );
}

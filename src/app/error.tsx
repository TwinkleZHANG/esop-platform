"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * 全局错误边界（PRD 未显式定义，但作为安全兜底）。
 * 服务器侧的错误在 dev 下会展示完整堆栈；生产环境下 Next.js 只传简短 digest。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 打到服务器日志
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="text-5xl font-semibold text-destructive">Oops</div>
      <h1 className="text-xl font-semibold">页面出错了</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        发生了意料之外的错误，请稍后重试或联系管理员。
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => reset()}>
          重试
        </Button>
        <Button onClick={() => (window.location.href = "/")}>返回首页</Button>
      </div>
    </div>
  );
}

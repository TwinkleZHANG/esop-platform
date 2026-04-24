import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="text-5xl font-semibold text-muted-foreground">404</div>
      <h1 className="text-xl font-semibold">页面未找到</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        你访问的页面不存在，可能链接已失效或被移除。
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "default", size: "default" }))}
      >
        返回首页
      </Link>
    </div>
  );
}

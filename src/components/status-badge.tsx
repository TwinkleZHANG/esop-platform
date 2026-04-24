import { cn } from "@/lib/utils";

// PRD 9.2 配色：
//   成功 #059669（绿）、进行中 #2563EB（蓝）、警告 #D97706（橙）
//   信息 #7C3AED（紫）、危险 #DC2626（红）、关闭中 #EA580C（深橙）
const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  progress: "bg-blue-50 text-blue-700 border border-blue-200",
  warn: "bg-amber-50 text-amber-700 border border-amber-200",
  info: "bg-violet-50 text-violet-700 border border-violet-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  closing: "bg-orange-50 text-orange-700 border border-orange-200",
  muted: "bg-muted text-muted-foreground border border-border",
};

export type StatusTone = keyof typeof TONE_CLASS;

export function StatusBadge({
  tone,
  children,
}: {
  tone: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[tone]
      )}
    >
      {children}
    </span>
  );
}

"use client";

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

/**
 * 内联日期范围筛选：from / to ISO yyyy-mm-dd 字符串。空字符串视为不限。
 * 响应式：宽屏 label 与日期框同一行；窄屏 label 独占一行，日期框下移。
 */
export function DateRangeFilter({ from, to, onChange, label = "日期" }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-full text-muted-foreground sm:w-auto">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        />
        <span className="text-muted-foreground">至</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        />
        {(from || to) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className="text-xs text-muted-foreground hover:underline"
          >
            清空
          </button>
        )}
      </div>
    </div>
  );
}

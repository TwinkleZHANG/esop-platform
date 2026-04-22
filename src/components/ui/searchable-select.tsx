"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
}

/**
 * 轻量的"输入过滤 + 列表选一"组件，替代未能稳定工作的 Base UI Select。
 * 展示为内嵌列表（非弹层），适合对话框/表单内使用。
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "输入关键字过滤",
  emptyText = "无匹配",
  allowClear,
}: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    if (!lower) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(lower) ||
        o.value.toLowerCase().includes(lower) ||
        (o.description ?? "").toLowerCase().includes(lower)
    );
  }, [q, options]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
      />
      <div className="max-h-44 overflow-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((o) => {
              const isSelected = value === o.value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-muted",
                      isSelected && "bg-muted font-medium"
                    )}
                  >
                    <div>{o.label}</div>
                    {o.description && (
                      <div className="text-xs text-muted-foreground">
                        {o.description}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            已选：<span className="text-foreground">{selected.label}</span>
          </span>
          {allowClear && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-destructive hover:underline"
            >
              清除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

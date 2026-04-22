"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
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
  searchPlaceholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

/**
 * Combobox：默认呈现为一个输入框（展示选中项名称或 placeholder），
 * 点击后弹出下拉，顶部是过滤搜索，下方为选项列表。
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchPlaceholder = "按名称/ID 搜索",
  emptyText = "无匹配",
  allowClear,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

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

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 打开时聚焦搜索框、重置 query
  useEffect(() => {
    if (open) {
      setQ("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm outline-none",
          "focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span
          className={cn(
            "flex-1 truncate",
            !selected && "text-muted-foreground"
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <span className="ml-2 flex items-center gap-1 text-muted-foreground">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 hover:bg-muted"
              aria-label="清除"
            >
              <XIcon className="size-3.5" />
            </span>
          )}
          <ChevronDownIcon className="size-4" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="border-b border-border p-2">
            <Input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8"
            />
          </div>
          <ul className="max-h-48 overflow-auto">
            {filtered.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">
                {emptyText}
              </li>
            ) : (
              filtered.map((o) => {
                const isSelected = value === o.value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
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
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

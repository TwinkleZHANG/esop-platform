"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  options: NativeSelectOption[];
  placeholder?: string;
}

/**
 * 原生 select 包装，Tailwind 样式对齐 Input 外观。
 * 替代 Base UI Select（在 base-nova style 下受控 value 存在问题）。
 */
export function NativeSelect({
  value,
  onChange,
  options,
  className,
  placeholder,
  disabled,
  ...rest
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

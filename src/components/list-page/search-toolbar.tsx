"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DateRangeFilter } from "./date-range-filter";
import type { ReactNode } from "react";

export interface FilterSpec {
  name: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export interface DateRangeSpec {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

interface Props {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  };
  filters?: FilterSpec[];
  dateRange?: DateRangeSpec;
  right?: ReactNode;
}

export function SearchToolbar({
  search,
  filters = [],
  dateRange,
  right,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {search && (
        <Input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          className="w-full sm:w-64"
        />
      )}
      {filters.map((f) => (
        <NativeSelect
          key={f.name}
          value={f.value}
          onChange={f.onChange}
          options={f.options}
          className="w-full sm:w-40"
        />
      ))}
      {dateRange && (
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={dateRange.onChange}
          label={dateRange.label}
        />
      )}
      {right && <div className="sm:ml-auto">{right}</div>}
    </div>
  );
}

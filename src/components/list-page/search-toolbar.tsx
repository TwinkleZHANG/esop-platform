"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ReactNode } from "react";

export interface FilterSpec {
  name: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

interface Props {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  };
  filters?: FilterSpec[];
  right?: ReactNode;
}

export function SearchToolbar({ search, filters = [], right }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {search && (
        <Input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          className="w-64"
        />
      )}
      {filters.map((f) => (
        <NativeSelect
          key={f.name}
          value={f.value}
          onChange={f.onChange}
          options={f.options}
          className="w-40"
        />
      ))}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

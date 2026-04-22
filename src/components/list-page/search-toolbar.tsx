"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <Select
          key={f.name}
          value={f.value}
          onValueChange={(v) => f.onChange(v ?? "")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={f.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

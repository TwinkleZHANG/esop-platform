"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const PRESET = [0, 30, 90, 365];

interface Props {
  value: number | undefined;
  onChange: (n: number) => void;
}

/**
 * 行权窗口期选择器：预设 0/30/90/365 天 + 自定义（输入任意正整数天数）。
 */
export function WindowDaysPicker({ value, onChange }: Props) {
  const isPreset = value !== undefined && PRESET.includes(value);
  const [custom, setCustom] = useState(value !== undefined && !isPreset);

  return (
    <div className="space-y-1">
      <NativeSelect
        value={custom ? "CUSTOM" : value !== undefined ? String(value) : ""}
        onChange={(v) => {
          if (v === "CUSTOM") {
            setCustom(true);
          } else if (v === "") {
            // 「请选择」占位项
            setCustom(false);
          } else {
            setCustom(false);
            onChange(Number(v));
          }
        }}
        options={[
          { value: "", label: "请选择" },
          { value: "0", label: "0 天（立即关闭）" },
          { value: "30", label: "30 天" },
          { value: "90", label: "90 天" },
          { value: "365", label: "365 天" },
          { value: "CUSTOM", label: "自定义" },
        ]}
      />
      {custom && (
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="天"
          value={value !== undefined && !isPreset ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 0) onChange(n);
          }}
        />
      )}
    </div>
  );
}

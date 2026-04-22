"use client";

import { useEffect, useState } from "react";

/** 对输入值做防抖，默认 300ms（PRD 9.6 搜索规范） */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

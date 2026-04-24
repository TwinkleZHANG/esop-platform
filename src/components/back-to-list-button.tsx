"use client";

import { useRouter } from "next/navigation";

/**
 * 详情页通用「← 返回列表」按钮：
 * 走浏览器 history.back()，自动保留列表页 URL 上携带的搜索/筛选/分页 query。
 */
export function BackToListButton({
  label = "← 返回列表",
}: {
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-sm text-muted-foreground hover:underline"
    >
      {label}
    </button>
  );
}

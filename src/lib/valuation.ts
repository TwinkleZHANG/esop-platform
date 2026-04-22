import type { Valuation } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 按 PRD 4.4 FMV 引用规则：取 valuationDate ≤ triggerDate 的最近一条估值记录。
 * 如果触发日之前没有任何估值记录，返回 null（调用方不应生成税务事件）。
 */
export async function getFMVForDate(
  triggerDate: Date
): Promise<Valuation | null> {
  return prisma.valuation.findFirst({
    where: { valuationDate: { lte: triggerDate } },
    orderBy: { valuationDate: "desc" },
  });
}

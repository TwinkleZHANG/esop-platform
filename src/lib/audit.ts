import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 使用 Prisma 事务客户端或顶层 prisma 均可。状态变更日志不可修改（PRD 3.9）。
 */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 写入一条 Grant 状态变更日志。
 * 时间戳由 DB 默认写为 UTC（schema：timestamp DateTime @default(now())）。
 */
export async function createStatusLog(
  grantId: string,
  fromStatus: string,
  toStatus: string,
  operatorName: string,
  legalDocument?: string | null,
  tx?: Db
) {
  const client: Db = tx ?? prisma;
  return client.statusChangeLog.create({
    data: {
      grantId,
      fromStatus,
      toStatus,
      operatorName,
      legalDocument: legalDocument ?? null,
    },
  });
}

/**
 * 把 UTC 时间戳格式化为 UTC+8 展示字符串（YYYY-MM-DD HH:mm:ss）。
 */
export function formatUtc8(date: Date): string {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())}` +
    ` ${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`
  );
}

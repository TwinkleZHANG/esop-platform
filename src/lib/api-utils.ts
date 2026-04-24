import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * 约束可被 Prisma.Decimal 安全解析的数值字段：接受 number 或匹配 ^\d+(\.\d+)?$ 的字符串。
 * 避免 new Prisma.Decimal(invalidString) 抛未捕获的运行时异常。
 */
export const decimalLike = z.union([
  z.number().refine((n) => Number.isFinite(n), "数字格式错误"),
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, "数字格式错误"),
]);

// ========== 统一响应 ==========

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
export interface ApiFailure {
  success: false;
  error: string;
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, init);
}

export function fail(error: string, status = 400) {
  return NextResponse.json<ApiFailure>(
    { success: false, error },
    { status }
  );
}

// ========== 权限校验 ==========

type AuthedSession = Session & { user: NonNullable<Session["user"]> };

export async function requireSession(): Promise<
  AuthedSession | NextResponse<ApiFailure>
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return fail("未登录", 401);
  return session as AuthedSession;
}

export async function requirePermission(
  permission: Permission
): Promise<AuthedSession | NextResponse<ApiFailure>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return fail("未登录", 401);
  if (!hasPermission(session.user.role, permission)) {
    return fail("无权限", 403);
  }
  return session as AuthedSession;
}

export function isErrorResponse(
  x: unknown
): x is NextResponse<ApiFailure> {
  return x instanceof NextResponse;
}

// ========== 分页解析（默认每页 10 条，按创建时间倒序） ==========

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { pageSize?: number; maxPageSize?: number } = {}
): PaginationParams {
  const defaultPageSize = defaults.pageSize ?? 10;
  const maxPageSize = defaults.maxPageSize ?? 100;

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawSize = Number(searchParams.get("pageSize")) || defaultPageSize;
  const pageSize = Math.min(Math.max(1, rawSize), maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paged<T>(
  items: T[],
  total: number,
  { page, pageSize }: PaginationParams
): PagedResult<T> {
  return { items, total, page, pageSize };
}

/**
 * 解析 ?from=YYYY-MM-DD&to=YYYY-MM-DD。to 自动包到当天 23:59:59.999。
 * 任意一边缺失则不设。
 */
export function parseDateRange(searchParams: URLSearchParams): {
  gte?: Date;
  lte?: Date;
} {
  const out: { gte?: Date; lte?: Date } = {};
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (fromStr) {
    const dt = new Date(fromStr);
    if (!isNaN(dt.getTime())) out.gte = dt;
  }
  if (toStr) {
    const dt = new Date(toStr);
    if (!isNaN(dt.getTime())) {
      dt.setHours(23, 59, 59, 999);
      out.lte = dt;
    }
  }
  return out;
}

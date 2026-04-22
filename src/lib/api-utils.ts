import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

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

// ========== 分页解析（PRD 9.6：默认每页 20 条，按创建时间倒序） ==========

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
  const defaultPageSize = defaults.pageSize ?? 20;
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

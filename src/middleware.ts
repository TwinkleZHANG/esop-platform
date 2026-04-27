import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// 角色常量。避免在 Edge Runtime 中间件里直接 import @prisma/client。
const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  GRANT_ADMIN: "GRANT_ADMIN",
  APPROVAL_ADMIN: "APPROVAL_ADMIN",
  EMPLOYEE: "EMPLOYEE",
} as const;

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isChangePassword = pathname === "/change-password";

  // 未登录：仅允许访问登录页，其他一律重定向
  if (!token) {
    if (isPublic) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // 已登录：首次登录必须先改密码
  if (token.mustChangePassword && !isChangePassword) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 已登录又访问登录页，跳回首页
  if (isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 角色路由保护（PRD 7.3）
  const role = token.role as string;
  const isAdmin =
    role === ROLE.SUPER_ADMIN ||
    role === ROLE.GRANT_ADMIN ||
    role === ROLE.APPROVAL_ADMIN;
  const isEmployee = role === ROLE.EMPLOYEE;
  const isSuperAdmin = role === ROLE.SUPER_ADMIN;

  // 员工不得访问 /admin/*
  if (pathname.startsWith("/admin") && !isAdmin) {
    return redirectForbidden(req, isEmployee ? "/employee" : "/login");
  }

  // /employee/* 对员工和管理员都开放（管理员通过侧边栏切换查看自己的股权）

  // 用户管理仅超管
  if (pathname.startsWith("/admin/user-management") && !isSuperAdmin) {
    return redirectForbidden(req, "/admin");
  }

  return NextResponse.next();
}

function redirectForbidden(req: NextRequest, fallback: string) {
  const url = req.nextUrl.clone();
  url.pathname = fallback;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // 排除 Next 静态资源、favicon、所有 API（API 路由自行返回 JSON 401/403，不做重定向）
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};

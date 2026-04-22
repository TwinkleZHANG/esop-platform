import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isChangePassword = pathname === "/change-password";

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 排除 Next 静态资源、favicon、NextAuth API
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};

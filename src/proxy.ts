// Edge middleware — 不 import db，使用 thin auth.config
import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth");
  // /api/external/* 走自己的 Bearer token 認證（external-auth.ts），跳過 NextAuth gate
  const isExternalApi = pathname.startsWith("/api/external");
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isLogin && !isAuthApi && !isExternalApi) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};

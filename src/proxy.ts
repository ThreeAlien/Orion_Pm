// Edge middleware — 不 import db，使用 thin auth.config
import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth");
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isLogin && !isAuthApi) {
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

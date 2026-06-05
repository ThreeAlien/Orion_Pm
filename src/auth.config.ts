// Edge-safe Auth config — middleware 用這份（不 import db / Prisma）
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      // Calendar 串接：要 refresh token（offline + consent）+ calendar.events scope。
      // ⚠️ GCP consent screen 必須先加同一個 scope，否則登入會報錯——等 GCP 設好才會生效。
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;

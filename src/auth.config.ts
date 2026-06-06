// Edge-safe Auth config — middleware 用這份（不 import db / Prisma）
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      // Calendar 串接：要 refresh token（offline + consent）+ calendar scope。
      // calendar.events：讀寫自己主行事曆事件；calendar.readonly：讀使用者所有
      // 行事曆（含同事分享給他的）→ 才能在 orion-pm 合併顯示別人的行事曆。
      // ⚠️ GCP consent screen 必須先加同樣的 scope，否則登入報錯——設好才生效。
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;

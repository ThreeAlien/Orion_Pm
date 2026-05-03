// Auth.js v5 主配置（含 DB callbacks，僅 Node.js runtime）
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "@/lib/db";

// Google 登入白名單：來自 ALLOWED_EMAILS env var（comma-separated）
// 沒設或空 → 任何人都不准登入（防呆，避免 env 沒灌就全開）
function isAllowedEmail(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.has(email.toLowerCase());
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// Dev-only：用既有 email 直接登入給測試 / Playwright 跑完整 flow 用
// production build 時 NODE_ENV !== 'development'，這個 provider 不會被加進 NextAuth
const devProviders =
  process.env.NODE_ENV === "development"
    ? [
        Credentials({
          id: "dev-login",
          name: "Dev Login",
          credentials: {
            email: { label: "Email", type: "email" },
          },
          async authorize(creds) {
            if (process.env.NODE_ENV !== "development") return null;
            const email = creds?.email as string | undefined;
            if (!email) return null;
            const user = await db.user.findUnique({ where: { email } });
            if (!user) return null;
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            };
          },
        }),
      ]
    : [];

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      // Credentials (dev-login) 已在 authorize 內驗 user，不必再 upsert
      if (account?.provider === "dev-login") return true;
      // Google login → 先驗白名單，不在名單內擋掉
      if (account?.provider === "google" && !isAllowedEmail(user.email)) {
        return false;
      }
      // Google login → upsert into our User 表
      await db.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        },
        create: {
          email: user.email,
          name: user.name ?? "User",
          image: user.image ?? null,
        },
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});

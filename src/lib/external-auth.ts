// 外部系統（如 Orion QA）打 PM API 用的 Bearer token 驗證。
// 走 EXTERNAL_API_KEY 環境變數，不走 NextAuth session。
// 不適合給瀏覽器直連 — 一定要在外部系統的 server action / backend 中轉。

import { db } from "@/lib/db";

export type AuthCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

// email → user.id；找不到自動建（QA 那邊指派的 user 可能還沒登入過 PM）
// trusted call：呼叫端已過 Bearer token 驗證
export async function resolveAssigneeId(
  email: string | null | undefined
): Promise<string | null> {
  if (!email) return null;
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.user.create({
    data: { email, name: email.split("@")[0] || email },
    select: { id: true },
  });
  return created.id;
}

export function checkBearer(request: Request): AuthCheck {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) {
    return { ok: false, status: 500, error: "EXTERNAL_API_KEY 未設定" };
  }
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "缺少 Bearer token" };
  }
  const token = auth.slice(7).trim();
  if (token !== expected) {
    return { ok: false, status: 401, error: "Token 無效" };
  }
  return { ok: true };
}

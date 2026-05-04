// 外部系統（如 Orion QA）打 PM API 用的 Bearer token 驗證。
// 走 EXTERNAL_API_KEY 環境變數，不走 NextAuth session。
// 不適合給瀏覽器直連 — 一定要在外部系統的 server action / backend 中轉。

export type AuthCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

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

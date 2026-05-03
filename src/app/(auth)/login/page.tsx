import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const { error } = await searchParams;
  const credentialsConfigured =
    !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="bg-surface rounded-3xl shadow-2xl p-12 w-[440px] max-w-[92vw] text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-orange to-pink text-white font-bold text-3xl flex items-center justify-center shadow-[0_4px_12px_rgba(255,149,0,0.32)]">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Orion PM</h1>
        <p className="text-text-dim mb-8 text-sm">
          輕量專案管理 — 看板 / 甘特 / 行事曆 / 文件
        </p>

        {error && (
          <div className="mb-5 bg-red/[.08] border border-red/30 text-red rounded-xl px-4 py-3 text-sm text-left">
            <div className="font-semibold mb-1">無法登入</div>
            <div className="text-xs leading-relaxed text-red/90">
              你的 Google 帳號不在白名單。請聯絡管理員
              <span className="font-mono">（allways.weider@gmail.com）</span>
              加入後再試。
            </div>
          </div>
        )}

        {credentialsConfigured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full bg-blue text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2.5 hover:brightness-95 cursor-pointer"
            >
              <GoogleLogo />
              用 Google 帳號登入
            </button>
          </form>
        ) : (
          <div className="text-left bg-rule-soft rounded-xl p-4 text-sm">
            <div className="font-semibold mb-2 text-orange">⚠️ 未設定 Google OAuth</div>
            <p className="text-text-dim text-xs leading-relaxed mb-3">
              請去{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                className="text-blue underline"
              >
                Google Cloud Console
              </a>{" "}
              建立 OAuth 2.0 Client，把 ID / Secret 填到{" "}
              <code className="bg-surface px-1 py-0.5 rounded text-[11px]">.env</code>
            </p>
          </div>
        )}

        {isDev && (
          <div className="mt-6 pt-6 border-t border-rule">
            <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-3">
              開發測試（僅 dev 模式）
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("dev-login", {
                  email: "allways.weider@gmail.com",
                  redirectTo: "/",
                });
              }}
            >
              <button
                type="submit"
                className="w-full bg-rule-soft hover:bg-rule text-text-dim py-2.5 rounded-lg text-sm font-medium cursor-pointer"
              >
                🧪 DEV：用 weider 登入
              </button>
            </form>
          </div>
        )}

        <p className="mt-6 text-xs text-text-faint">
          僅授權 email + profile · 你的 Google 密碼不會送到我們這邊
        </p>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#fff"
        d="M21.35 11.1H12v3.2h5.35c-.45 2.05-2.5 3.8-5.35 3.8-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.45 0 2.75.55 3.7 1.45l2.4-2.4C16.45 3.95 14.4 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.55-.05-1.1-.15-1.6z"
      />
    </svg>
  );
}

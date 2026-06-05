// 全域團隊範圍（cookie 持久化）。"all" = 看全部；否則為 team slug。
// 只在 Server Component / server action 使用（依賴 next/headers）。
import { cookies } from "next/headers";

export const TEAM_COOKIE = "orion_team";
export const TEAM_SCOPE_ALL = "all";

export async function getTeamScope(): Promise<string> {
  const c = await cookies();
  return c.get(TEAM_COOKIE)?.value || TEAM_SCOPE_ALL;
}

// 某項目（自帶 teamSlug）是否落在目前範圍內。
// "all" → 全顯示；指定團隊 → 只顯示該團隊（未分隊 teamSlug=null 只在「全部」出現）。
export function inTeamScope(
  teamSlug: string | null | undefined,
  scope: string
): boolean {
  if (scope === TEAM_SCOPE_ALL) return true;
  return teamSlug === scope;
}

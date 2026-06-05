// AppShell：server async fetch data → 餵 client ResponsiveLayout
import {
  fetchProjects,
  fetchUsers,
  fetchTeams,
  fetchUserAvatar,
} from "@/server/queries";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";
import { auth } from "@/auth";
import { ResponsiveLayout } from "./responsive-layout";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, projects, users, teams, scope] = await Promise.all([
    auth(),
    fetchProjects(),
    fetchUsers(),
    fetchTeams(),
    getTeamScope(),
  ]);
  // sidebar 專案列表跟著全域團隊範圍縮（未分隊專案只在「全部」出現）
  const scopedProjects = projects.filter((p) => inTeamScope(p.teamSlug, scope));
  // sidebar 頭像 / 名稱從 DB 讀（反映成員頁自助編輯；自訂 avatarUrl 優先），
  // 不靠 session.user（那是 Google 帶入、也避免 base64 頭貼塞爆 JWT）
  const profile = session?.user?.id
    ? await fetchUserAvatar(session.user.id)
    : null;
  const sessionUser = profile
    ? { name: profile.name, image: profile.image, avatarColor: profile.avatarColor }
    : session?.user
    ? {
        name: session.user.name ?? "User",
        image: session.user.image ?? null,
        avatarColor: null,
      }
    : null;
  return (
    <ResponsiveLayout
      projects={scopedProjects}
      users={users}
      teams={teams}
      teamScope={scope}
      sessionUser={sessionUser}
      currentUserId={session?.user?.id}
    >
      {children}
    </ResponsiveLayout>
  );
}

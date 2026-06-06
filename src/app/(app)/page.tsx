import { KanbanDashboard } from "@/components/kanban";
import { fetchTasks, fetchProjects, fetchUsers } from "@/server/queries";
import { fetchUnreadMentionTaskIds } from "@/server/actions";
import { computeDashboardStats } from "@/lib/data";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";
import { auth } from "@/auth";

export default async function DashboardPage() {
  const [allTasks, allProjects, users, scope, session, unreadMentionTaskIds] =
    await Promise.all([
      fetchTasks(),
      fetchProjects(),
      fetchUsers(),
      getTeamScope(),
      auth(),
      fetchUnreadMentionTaskIds(),
    ]);
  const tasks = allTasks.filter((t) => inTeamScope(t.teamSlug, scope));
  const projects = allProjects.filter((p) => inTeamScope(p.teamSlug, scope));
  const stats = computeDashboardStats(tasks);

  return (
    <KanbanDashboard
      tasks={tasks}
      projects={projects}
      users={users}
      stats={stats}
      currentUserId={session?.user?.id}
      unreadMentionTaskIds={unreadMentionTaskIds}
    />
  );
}

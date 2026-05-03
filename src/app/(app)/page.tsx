import { KanbanDashboard } from "@/components/kanban";
import { fetchTasks, fetchProjects, fetchUsers } from "@/server/queries";
import { computeDashboardStats } from "@/lib/data";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [tasks, projects, users, session] = await Promise.all([
    fetchTasks(),
    fetchProjects(),
    fetchUsers(),
    auth(),
  ]);
  const stats = computeDashboardStats(tasks);

  return (
    <KanbanDashboard
      tasks={tasks}
      projects={projects}
      users={users}
      stats={stats}
      currentUserId={session?.user?.id}
    />
  );
}

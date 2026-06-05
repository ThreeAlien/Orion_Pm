import { TasksList } from "@/components/tasks-list";
import { fetchTasks, fetchProjects, fetchUsers } from "@/server/queries";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";

export default async function TasksPage() {
  const [allTasks, allProjects, users, scope] = await Promise.all([
    fetchTasks(),
    fetchProjects(),
    fetchUsers(),
    getTeamScope(),
  ]);
  const tasks = allTasks.filter((t) => inTeamScope(t.teamSlug, scope));
  const projects = allProjects.filter((p) => inTeamScope(p.teamSlug, scope));
  return <TasksList tasks={tasks} projects={projects} users={users} />;
}

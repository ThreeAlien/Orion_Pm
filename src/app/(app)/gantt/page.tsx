import { GanttView, type Zoom } from "@/components/gantt";
import { auth } from "@/auth";
import {
  fetchGanttProjects,
  fetchGanttTasks,
  fetchTasks,
  fetchUsers,
} from "@/server/queries";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";

const VALID_ZOOMS: Zoom[] = ["day", "week", "month", "quarter"];

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; project?: string; zoom?: string }>;
}) {
  const params = await searchParams;
  const isTaskLevel = params.level === "tasks";
  const zoom: Zoom = VALID_ZOOMS.includes(params.zoom as Zoom)
    ? (params.zoom as Zoom)
    : "week";

  const [allProjects, allTasksRaw, users, scope, session] = await Promise.all([
    fetchGanttProjects(),
    fetchTasks(),
    fetchUsers(),
    getTeamScope(),
    auth(),
  ]);
  const currentUserId = session?.user?.id;
  const projects = allProjects.filter((p) => inTeamScope(p.teamSlug, scope));
  const allTasks = allTasksRaw.filter((t) => inTeamScope(t.teamSlug, scope));

  if (isTaskLevel) {
    const projectId =
      params.project ?? projects.find((p) => !p.isCompleted)?.id ?? projects[0]?.id;
    const tasks = projectId ? await fetchGanttTasks(projectId) : [];
    return (
      <GanttView
        mode="tasks"
        zoom={zoom}
        projects={projects}
        tasks={tasks}
        viewTasks={allTasks}
        users={users}
        currentUserId={currentUserId}
        selectedProjectId={projectId}
      />
    );
  }

  return (
    <GanttView
      mode="projects"
      zoom={zoom}
      projects={projects}
      viewTasks={allTasks}
      users={users}
      currentUserId={currentUserId}
    />
  );
}

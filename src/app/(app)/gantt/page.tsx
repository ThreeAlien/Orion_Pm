import { GanttView, type Zoom } from "@/components/gantt";
import {
  fetchGanttProjects,
  fetchGanttTasks,
  fetchTasks,
  fetchUsers,
} from "@/server/queries";

export const dynamic = "force-dynamic";

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

  const [projects, allTasks, users] = await Promise.all([
    fetchGanttProjects(),
    fetchTasks(),
    fetchUsers(),
  ]);

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
    />
  );
}

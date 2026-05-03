import { TasksList } from "@/components/tasks-list";
import { fetchTasks, fetchProjects } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([fetchTasks(), fetchProjects()]);
  return <TasksList tasks={tasks} projects={projects} />;
}

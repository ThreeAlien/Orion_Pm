import { TasksList } from "@/components/tasks-list";
import { fetchTasks, fetchProjects, fetchUsers } from "@/server/queries";

export default async function TasksPage() {
  const [tasks, projects, users] = await Promise.all([
    fetchTasks(),
    fetchProjects(),
    fetchUsers(),
  ]);
  return <TasksList tasks={tasks} projects={projects} users={users} />;
}

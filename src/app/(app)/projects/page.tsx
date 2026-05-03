import { ProjectsList } from "@/components/projects-list";
import { fetchProjectDetails, fetchUsers } from "@/server/queries";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, users, session] = await Promise.all([
    fetchProjectDetails(),
    fetchUsers(),
    auth(),
  ]);
  return (
    <ProjectsList
      projects={projects}
      users={users}
      currentUserId={session?.user?.id}
    />
  );
}

import { ProjectsList } from "@/components/projects-list";
import { fetchProjectDetails, fetchUsers, fetchTeams } from "@/server/queries";
import { auth } from "@/auth";

export default async function ProjectsPage() {
  const [projects, users, teams, session] = await Promise.all([
    fetchProjectDetails(),
    fetchUsers(),
    fetchTeams(),
    auth(),
  ]);
  return (
    <ProjectsList
      projects={projects}
      users={users}
      teams={teams}
      currentUserId={session?.user?.id}
    />
  );
}

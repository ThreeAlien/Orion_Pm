import { ProjectsList } from "@/components/projects-list";
import { fetchProjectDetails, fetchUsers, fetchTeams } from "@/server/queries";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";
import { auth } from "@/auth";

export default async function ProjectsPage() {
  const [allProjects, users, teams, scope, session] = await Promise.all([
    fetchProjectDetails(),
    fetchUsers(),
    fetchTeams(),
    getTeamScope(),
    auth(),
  ]);
  const projects = allProjects.filter((p) => inTeamScope(p.teamSlug, scope));
  return (
    <ProjectsList
      projects={projects}
      users={users}
      teams={teams}
      currentUserId={session?.user?.id}
    />
  );
}

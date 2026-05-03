// AppShell：server async fetch data → 餵 client ResponsiveLayout
import { fetchProjects, fetchUsers } from "@/server/queries";
import { auth } from "@/auth";
import { ResponsiveLayout } from "./responsive-layout";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, projects, users] = await Promise.all([
    auth(),
    fetchProjects(),
    fetchUsers(),
  ]);
  const sessionUser = session?.user
    ? {
        name: session.user.name ?? "User",
        image: session.user.image ?? null,
      }
    : null;
  return (
    <ResponsiveLayout
      projects={projects}
      users={users}
      sessionUser={sessionUser}
      currentUserId={session?.user?.id}
    >
      {children}
    </ResponsiveLayout>
  );
}

import { DocumentsList } from "@/components/documents-list";
import {
  fetchDocuments,
  fetchUsers,
  fetchProjects,
} from "@/server/queries";
import { auth } from "@/auth";

export default async function DocumentsPage() {
  const [documents, users, projects, session] = await Promise.all([
    fetchDocuments(),
    fetchUsers(),
    fetchProjects(),
    auth(),
  ]);
  return (
    <DocumentsList
      documents={documents}
      users={users}
      projects={projects}
      currentUserId={session?.user?.id}
    />
  );
}

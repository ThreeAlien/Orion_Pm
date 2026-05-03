import { ArchiveView } from "@/components/archive-view";
import { fetchArchivedAll } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { tasks, projects, documents } = await fetchArchivedAll();
  return (
    <ArchiveView tasks={tasks} projects={projects} documents={documents} />
  );
}

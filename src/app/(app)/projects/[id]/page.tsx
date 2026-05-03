import {
  fetchProjectDetail,
  fetchTasks,
  fetchProjects,
  fetchUsers,
} from "@/server/queries";
import { KanbanBoard } from "@/components/kanban-board";
import { EditProjectButton } from "@/components/edit-project-button";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ViewProjectDetail } from "@/server/queries";
import type { ProjectStatus, ViewUser } from "@/lib/data";
import { resolveProjectColor } from "@/lib/data";

export const dynamic = "force-dynamic";

const statusMap: Record<ProjectStatus, { label: string; bg: string; dot: string }> = {
  PLANNING: { label: "規劃中", bg: "bg-blue/[.12]", dot: "bg-blue" },
  PAUSED: { label: "暫停", bg: "bg-orange/[.13]", dot: "bg-orange" },
  IN_PROGRESS: { label: "進行中", bg: "bg-green/[.14]", dot: "bg-green" },
  DONE: { label: "已完成", bg: "bg-purple/[.13]", dot: "bg-purple" },
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, tasks, projects, users] = await Promise.all([
    fetchProjectDetail(id),
    fetchTasks(),
    fetchProjects(),
    fetchUsers(),
  ]);
  if (!project) notFound();

  const projectTasks = tasks.filter((t) => t.projectId === id);

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <DetailHeader project={project} users={users} />
      <KanbanBoard tasks={projectTasks} projects={projects} users={users} />
    </div>
  );
}

function DetailHeader({
  project,
  users,
}: {
  project: ViewProjectDetail;
  users: ViewUser[];
}) {
  const status = statusMap[project.status];
  const dot = resolveProjectColor(project.color);
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-xs text-text-faint mb-2">
        <Link href="/projects" className="hover:text-text">
          Projects
        </Link>
        <span>/</span>
        <span className="text-text">{project.name}</span>
      </div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base"
          style={{ background: dot }}
        >
          {project.name.charAt(0)}
        </span>
        <h1 className="text-[28px] font-bold tracking-tight">{project.name}</h1>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${status.bg}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
        <div className="flex-1" />
        <EditProjectButton project={project} users={users} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat label="完成率" value={`${project.completionRate}%`} accent={dot} />
        <Stat
          label="任務"
          value={`${project.completedTasks}/${project.totalTasks}`}
        />
        <Stat label="負責人" value={project.ownerName} />
        <Stat
          label="期間"
          value={
            project.startDate && project.endDate
              ? `${fmt(project.startDate)} → ${fmt(project.endDate)}`
              : project.endDate
              ? `截 ${fmt(project.endDate)}`
              : "未定"
          }
        />
      </div>

      <div className="h-2 bg-rule rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${project.completionRate}%`, background: dot }}
        />
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className="text-base font-bold tabular tracking-tight truncate"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

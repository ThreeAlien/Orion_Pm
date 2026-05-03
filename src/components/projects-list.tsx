// Projects 列表頁 — 卡片 grid
import type { ViewProjectDetail } from "@/server/queries";
import type { ProjectStatus, ViewUser } from "@/lib/data";
import { resolveProjectColor } from "@/lib/data";
import { NewProjectButton } from "./new-project-button";
import { ArchiveProjectButton } from "./archive-project-button";

const statusMap: Record<ProjectStatus, { label: string; bg: string; dot: string }> = {
  PLANNING: { label: "規劃中", bg: "bg-blue/[.12]", dot: "bg-blue" },
  PAUSED: { label: "暫停", bg: "bg-orange/[.13]", dot: "bg-orange" },
  IN_PROGRESS: { label: "進行中", bg: "bg-green/[.14]", dot: "bg-green" },
  DONE: { label: "已完成", bg: "bg-purple/[.13]", dot: "bg-purple" },
};


export function ProjectsList({
  projects,
  users,
  currentUserId,
}: {
  projects: ViewProjectDetail[];
  users: ViewUser[];
  currentUserId?: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <h1 className="text-[28px] font-bold tracking-tight">Projects</h1>
        <span className="text-[13px] text-text-dim tabular">
          {projects.length} 個專案
        </span>
        <div className="flex-1" />
        <NewProjectButton users={users} currentUserId={currentUserId} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ViewProjectDetail }) {
  const status = statusMap[project.status];
  const isDone = project.status === "DONE";

  return (
    <div
      className="bg-surface-2 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Top line：彩色裝飾 */}
      <div
        className="h-1 -mx-5 -mt-5 mb-4 rounded-t-2xl"
        style={{ background: resolveProjectColor(project.color) }}
      />

      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{ background: resolveProjectColor(project.color) }}
        >
          {project.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className={`font-bold text-base tracking-tight truncate flex-1 ${isDone ? "text-text-dim" : ""}`}>
              {project.name}
            </div>
            <ArchiveProjectButton id={project.id} name={project.name} />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${status.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* progress */}
      <div className="mb-4">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[11px] text-text-dim font-semibold tracking-wide">進度</span>
          <span className="text-lg font-bold tabular tracking-tight" style={{ color: resolveProjectColor(project.color) }}>
            {project.completionRate}%
          </span>
        </div>
        <div className="h-1.5 bg-rule rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${project.completionRate}%`,
              background: resolveProjectColor(project.color),
            }}
          />
        </div>
      </div>

      {/* meta */}
      <div className="grid grid-cols-2 gap-3 text-[11px] text-text-dim">
        <Meta label="任務" value={`${project.completedTasks}/${project.totalTasks}`} />
        <Meta
          label="負責人"
          value={project.ownerName}
        />
        <Meta
          label="開始"
          value={project.startDate ? fmt(project.startDate) : "—"}
        />
        <Meta
          label="截止"
          value={project.endDate ? fmt(project.endDate) : "未定"}
        />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-faint">{label}</div>
      <div className="text-text font-semibold tabular mt-0.5 truncate">{value}</div>
    </div>
  );
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

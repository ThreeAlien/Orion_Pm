import {
  fetchProjectDetail,
  fetchTasks,
  fetchProjects,
  fetchUsers,
  fetchTeams,
} from "@/server/queries";
import { KanbanBoard } from "@/components/kanban-board";
import { EditProjectButton } from "@/components/edit-project-button";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ViewProjectDetail } from "@/server/queries";
import type { ProjectStatus, ViewUser, ViewTeam } from "@/lib/data";
import {
  resolveProjectColor,
  projectCategoryLabels,
  projectAttributeLabel,
} from "@/lib/data";

const statusMap: Record<ProjectStatus, { label: string; bg: string; dot: string }> = {
  DEVELOPING: { label: "開發", bg: "bg-blue/[.12]", dot: "bg-blue" },
  SIGNED: { label: "已簽約執行", bg: "bg-green/[.14]", dot: "bg-green" },
  CLOSED: { label: "結案", bg: "bg-text-faint/[.12]", dot: "bg-text-faint" },
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, tasks, projects, users, teams] = await Promise.all([
    fetchProjectDetail(id),
    fetchTasks(),
    fetchProjects(),
    fetchUsers(),
    fetchTeams(),
  ]);
  if (!project) notFound();

  const projectTasks = tasks.filter((t) => t.projectId === id);

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <DetailHeader project={project} users={users} teams={teams} />
      <KanbanBoard tasks={projectTasks} projects={projects} users={users} />
    </div>
  );
}

function DetailHeader({
  project,
  users,
  teams,
}: {
  project: ViewProjectDetail;
  users: ViewUser[];
  teams: ViewTeam[];
}) {
  const status = statusMap[project.status];
  const dot = resolveProjectColor(project.color);
  const categoryLabels = projectCategoryLabels(project.category);
  const period =
    project.startDate && project.endDate
      ? `${fmt(project.startDate)} → ${fmt(project.endDate)}`
      : project.endDate
      ? `截 ${fmt(project.endDate)}`
      : project.startDate
      ? `${fmt(project.startDate)} 起`
      : "未定";

  return (
    <div className="mb-5">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-xs text-text-faint mb-2">
        <Link href="/projects" className="hover:text-text">
          Projects
        </Link>
        <span>/</span>
        <span className="text-text">{project.name}</span>
      </div>

      {/* 頂部：名稱 + 狀態徽章 + 案件屬性標籤 */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
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
        {project.attribute && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border border-rule text-text-dim">
            {projectAttributeLabel(project.attribute)}
          </span>
        )}
        <div className="flex-1" />
        <EditProjectButton project={project} users={users} teams={teams} />
      </div>

      {/* 分組卡片：客戶資訊 / 案件分類 / 時程與進度 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
        <InfoCard title="客戶資訊">
          <FieldRow label="客戶名稱" value={project.customerName} />
          <FieldRow label="品牌名稱" value={project.brandName} />
          <FieldRow label="客戶統編" value={project.taxId} />
          <FieldRow label="業務名稱" value={project.salesName} />
        </InfoCard>

        <InfoCard title="案件分類">
          <div>
            <div className="text-text-faint text-[12.5px] mb-1.5">客戶需求品項</div>
            {categoryLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categoryLabels.map((label, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[12.5px] font-semibold bg-blue/[.12] text-blue"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-dim">—</div>
            )}
          </div>
          <FieldRow label="案件來源" value={project.source} />
        </InfoCard>

        <InfoCard title="時程與進度" className="md:col-span-2 lg:col-span-1">
          <FieldRow label="專案期間" value={period === "未定" ? null : period} />
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-text-faint text-[12.5px]">完成率</span>
              <span
                className="text-sm font-bold tabular"
                style={{ color: dot }}
              >
                {project.completionRate}%
              </span>
            </div>
            <div className="h-1.5 bg-rule rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${project.completionRate}%`, background: dot }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm pt-0.5">
            <span className="text-text-dim">
              任務 <b className="text-text tabular">{project.completedTasks}/{project.totalTasks}</b>
            </span>
            <span className="text-text-dim truncate max-w-[50%]" title={project.ownerName}>
              負責人 <b className="text-text">{project.ownerName}</b>
            </span>
          </div>
        </InfoCard>
      </div>

      {/* 原有：背景說明 / 注意事項 */}
      {(project.background || project.notes) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {project.background && (
            <div className="bg-surface-2 rounded-lg px-4 py-3">
              <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
                專案背景說明
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-dim">
                {project.background}
              </p>
            </div>
          )}
          {project.notes && (
            <div className="bg-orange/[.08] border border-orange/20 rounded-lg px-4 py-3">
              <div className="text-[12.5px] text-orange font-semibold uppercase tracking-wider mb-1.5">
                ⚠ 注意事項
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-text-dim">
                {project.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 分組卡片外殼 — 沿用專案既有卡片語彙（bg-surface-2 + rounded-lg + faint uppercase 標題）
function InfoCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-surface-2 rounded-lg px-4 py-3.5 flex flex-col gap-2.5 ${className ?? ""}`}>
      <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  );
}

// 卡片內單一欄位；空值一律顯示「—」不留白
function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-faint text-[12.5px] flex-shrink-0">{label}</span>
      <span className="text-text font-semibold truncate text-right">
        {value && value.trim() ? value : "—"}
      </span>
    </div>
  );
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

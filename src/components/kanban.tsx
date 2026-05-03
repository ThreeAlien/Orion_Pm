// Dashboard 看板主視圖 — server component 包 client island KanbanBoard。
// FilterRow 已經移到 KanbanBoard 內（client，可點 chip 切換）
import {
  type ViewTask,
  type ViewProject,
  type ViewUser,
  type DashboardStats,
} from "@/lib/data";
import { ViewToggle } from "./view-toggle";
import { KanbanBoard } from "./kanban-board";

export function KanbanDashboard({
  tasks,
  projects,
  users,
  stats,
  currentUserId,
}: {
  tasks: ViewTask[];
  projects: ViewProject[];
  users: ViewUser[];
  stats: DashboardStats;
  currentUserId?: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <DashboardHeader stats={stats} />
      <KanbanBoard
        tasks={tasks}
        projects={projects}
        users={users}
        currentUserId={currentUserId}
        showFilterRow
      />
    </div>
  );
}

function DashboardHeader({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex items-center gap-3.5 mb-4 flex-wrap">
      <h1 className="text-[28px] font-bold tracking-tight">Dashboard</h1>
      <div className="flex gap-2">
        <StatChip>
          <b className="tabular">{stats.total}</b> 總任務
        </StatChip>
        <StatChip tone="warn">
          <b className="tabular">{stats.inProgress}</b> 進行中
        </StatChip>
        <StatChip tone="danger">
          <b className="tabular">{stats.overdue}</b> 逾期
        </StatChip>
        <StatChip tone="good">
          <b className="tabular">{stats.completionRate}%</b> 完成率
        </StatChip>
      </div>
      <div className="flex-1" />
      <ViewToggle />
    </div>
  );
}

function StatChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "warn" | "danger" | "good";
}) {
  const toneMap = {
    warn: "[&_b]:text-orange",
    danger: "[&_b]:text-red",
    good: "[&_b]:text-green",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] bg-rule-soft rounded-full text-xs text-text-dim font-medium [&_b]:text-text [&_b]:tabular ${
        tone ? toneMap[tone] : ""
      }`}
    >
      {children}
    </span>
  );
}

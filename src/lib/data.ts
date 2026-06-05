// View 層型別 + 看板顯示常數。
// Phase 1.0d 已砍掉 mock data，全部從 DB 經 src/server/queries.ts 餵進來。
import type {
  TaskStatus,
  TaskPriority,
  ProjectStatus,
  DocType,
  ActivityField,
} from "@/generated/prisma/client";

export type { TaskStatus, TaskPriority, ProjectStatus, DocType, ActivityField };

/// 任何 hex 字串（#RRGGBB）或 8 個常用 named token
export type ProjectColor = string;

export const NAMED_PROJECT_COLORS: Record<string, string> = {
  red: "#FF3B30",
  orange: "#FF9500",
  yellow: "#FFCC00",
  green: "#34C759",
  teal: "#5AC8FA",
  blue: "#007AFF",
  purple: "#AF52DE",
  pink: "#FF2D55",
};

/// 把 named ('red') 或 hex ('#FF5733') 都解成 hex
export function resolveProjectColor(c: string): string {
  return NAMED_PROJECT_COLORS[c] ?? c;
}

/// chip 用：12% alpha 背景 + 主色文字（任何 hex 都通用）
export function projectChipStyle(c: string): React.CSSProperties {
  const hex = resolveProjectColor(c);
  return { background: `${hex}24`, color: hex };
}
export type AvatarGradient = "w" | "l" | "s" | "y";
export type DuePillKind = "today" | "warn" | "danger" | "soft";

export interface ViewUser {
  id: string;
  name: string;
  initial: string;
  gradient: AvatarGradient;
}

export interface ViewProject {
  id: string;
  name: string;
  color: ProjectColor;
  taskCount: number;
  teamId?: string | null;
  teamSlug?: string | null;
  teamName?: string | null;
}

export interface ViewTeam {
  id: string;
  name: string;
  slug: string;
  color: ProjectColor;
  sort: number;
}

export interface ViewTask {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: string | null;
  assignee?: ViewUser;
  due?: string;
  duePill?: DuePillKind;
  /// raw ISO string (YYYY-MM-DDTHH:MM:SS.sssZ)，給 drawer / form 預填使用
  startDateIso?: string | null;
  dueDateIso?: string | null;
  subtasks?: { done: number; total: number };
  checklist?: { done: number; total: number };
  commentCount?: number;
  /// 任務所屬專案的團隊 slug（給全域團隊 filter 用）；無專案 / 專案未分隊 = null
  teamSlug?: string | null;
}

export interface ViewChecklistItem {
  id: string;
  content: string;
  done: boolean;
  position: number;
}

export interface ViewTaskRef {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface ViewDependencies {
  /// 此任務被以下任務阻擋（要先完成）
  blockedBy: ViewTaskRef[];
  /// 此任務阻擋了以下任務
  blocking: ViewTaskRef[];
}

// ==== 任務時間軸（留言 + 活動軌跡）====

export interface TimelineAuthor {
  /// null = 已從系統移除的使用者
  id: string | null;
  name: string;
  initial: string;
  gradient: AvatarGradient;
}

export interface ViewComment {
  kind: "comment";
  id: string;
  body: string;
  author: TimelineAuthor;
  createdAtIso: string;
  edited: boolean;
}

export interface ViewActivity {
  kind: "activity";
  id: string;
  field: ActivityField;
  fromValue: string | null;
  toValue: string | null;
  actor: TimelineAuthor;
  createdAtIso: string;
}

export type ViewTimelineItem = ViewComment | ViewActivity;

export interface DashboardStats {
  total: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
}

// 看板 column 定義
export const kanbanColumns: {
  status: TaskStatus;
  label: string;
  bar: "gray" | "orange" | "purple" | "green" | "red";
}[] = [
  { status: "TODO", label: "尚未開始", bar: "gray" },
  { status: "IN_PROGRESS", label: "進行中", bar: "orange" },
  { status: "WAITING_REVIEW", label: "等待驗收", bar: "purple" },
  { status: "DONE", label: "已完成", bar: "green" },
  { status: "ON_HOLD", label: "擱置", bar: "red" },
];

export function computeDashboardStats(tasks: ViewTask[]): DashboardStats {
  const total = tasks.length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter(
    (t) => t.duePill === "danger" && t.status !== "DONE"
  ).length;
  return {
    total,
    inProgress,
    overdue,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

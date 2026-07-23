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

// 頭貼底色：有自訂 token → 回 hex（純色背景）；沒設 → null（呼叫端 fallback 名字 gradient）
export function resolveAvatarColor(token: string | null | undefined): string | null {
  return token ? resolveProjectColor(token) : null;
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
  /// 自訂頭貼底色 token；null = 用名字 hash 的 gradient
  avatarColor?: string | null;
}

export interface ViewProject {
  id: string;
  name: string;
  color: ProjectColor;
  taskCount: number;
  teamId?: string | null;
  teamSlug?: string | null;
  teamName?: string | null;
  // 客戶資訊（任務卡顯示所屬專案的客戶資料用）
  customerName?: string | null;
  taxId?: string | null;
  brandName?: string | null;
  // 客戶需求品項（多選碼陣列）＝承接範圍；任務品項只能從其中單選（父子約束）
  category: string[];
}

export interface ViewTeam {
  id: string;
  name: string;
  slug: string;
  color: ProjectColor;
  sort: number;
}

// Google 行事曆事件（顯示用，日期用 ISO 字串方便傳給 client island）
export interface CalEventItem {
  googleEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startIso: string;
  endIso: string;
  allDay: boolean;
  // 來源行事曆（多行事曆合併時標示是誰的；主行事曆為 null）
  calendarName?: string | null;
  calendarColor?: string | null;
}

// 行事曆讀 Google 的狀態：ok / 未連結 / 授權過期 / API 讀取失敗
export type GoogleCalStatus = "ok" | "no_token" | "needs_reauth" | "api_error";

export interface ViewTask {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: string | null;
  // 客戶需求品項（單選碼）＝執行其中哪一個；須為所屬專案 category 之一，無專案則 null
  category: string | null;
  /// 主負責人（denormalized，給 gantt/list 等單一顯示用）
  assignee?: ViewUser;
  /// 完整負責人清單（多選）
  assignees?: ViewUser[];
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
  avatarColor?: string | null;
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

// 客戶需求品項（多選，存英文碼陣列）— 下拉選單與顯示共用
export const PROJECT_CATEGORIES = [
  { value: "WEBSITE_BUILD", label: "網站建置" },
  { value: "WEBSITE_PLAN", label: "網站企劃" },
  { value: "SEO_TW", label: "繁中SEO" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META_ADS", label: "Meta廣告" },
  { value: "CONSULTING", label: "顧問服務" },
  { value: "SEO_TW_RENEW", label: "續約繁中SEO" },
  { value: "GOOGLE_ADS_RENEW", label: "續約Google Ads" },
  { value: "META_ADS_RENEW", label: "續約Meta廣告" },
  { value: "SERVER_MAINTENANCE", label: "伺服器與系統維護" },
] as const;

// 單一碼 → label；未知碼（含已淘汰的 WEBSITE/SEO/AD/OTHER）fallback 顯示原碼，不 crash。
export function projectCategoryLabel(v?: string | null): string | null {
  if (!v) return null;
  return PROJECT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

// 多值碼陣列 → label 陣列，給多值 chips 顯示用
export function projectCategoryLabels(codes?: string[] | null): string[] {
  if (!codes || codes.length === 0) return [];
  return codes.map((c) => projectCategoryLabel(c) ?? c);
}

// 案件狀態（3 態）— label + 顏色 token，供表單與顯示共用
export const PROJECT_STATUS_OPTIONS: {
  value: ProjectStatus;
  label: string;
  bg: string;
  dot: string;
}[] = [
  { value: "DEVELOPING", label: "開發", bg: "bg-blue/[.12]", dot: "bg-blue" },
  { value: "SIGNED", label: "已簽約執行", bg: "bg-green/[.14]", dot: "bg-green" },
  { value: "CLOSED", label: "結案", bg: "bg-text-faint/[.12]", dot: "bg-text-faint" },
];

export function projectStatusMeta(v: ProjectStatus) {
  return (
    PROJECT_STATUS_OPTIONS.find((s) => s.value === v) ?? PROJECT_STATUS_OPTIONS[0]
  );
}

// 案件屬性（單選）
export const PROJECT_ATTRIBUTE_OPTIONS = [
  { value: "GENERAL", label: "一般案件" },
  { value: "PROJECT", label: "專案" },
] as const;

export function projectAttributeLabel(v?: string | null): string | null {
  if (!v) return null;
  return PROJECT_ATTRIBUTE_OPTIONS.find((a) => a.value === v)?.label ?? v;
}

// 案件來源 — 預設下拉選項（可自填任意中文字串，不受此清單限制）
export const PROJECT_SOURCE_PRESETS = ["官網", "轉介", "業務開發"] as const;

// Server-side queries：從 Prisma 讀 → map 成 View*。
// 直接給 React Server Component await，Phase 1.x 加 mutation 時改走 tRPC。
import { db } from "@/lib/db";
import type {
  ViewTask,
  ViewProject,
  ViewUser,
  ProjectColor,
  AvatarGradient,
  DuePillKind,
  ProjectStatus,
  DocType,
  ViewTimelineItem,
  TimelineAuthor,
  ViewChecklistItem,
  ViewTeam,
} from "@/lib/data";

const DAY_MS = 24 * 60 * 60 * 1000;

function pickGradient(name: string): AvatarGradient {
  const c = name[0]?.toLowerCase();
  if (c === "w") return "w";
  if (c === "l") return "l";
  if (c === "s") return "s";
  return "y";
}

function fmtMonthDay(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(due: Date, completedAt: Date | null): string {
  if (completedAt) return `✓ ${fmtMonthDay(due)}`;
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  if (diff < 0) return `逾 ${-diff} 天`;
  if (diff === 0) return "今日";
  if (diff <= 3) return `⌛ ${diff} 天`;
  return fmtMonthDay(due);
}

function pickDuePill(due: Date, status: string): DuePillKind {
  if (status === "DONE") return "soft";
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  if (diff < 0) return "danger";
  if (diff === 0) return "today";
  if (diff <= 3) return "warn";
  return "soft";
}

function toViewUser(
  name: string,
  id: string,
  avatarColor?: string | null
): ViewUser {
  return {
    id,
    name,
    initial: name[0] ?? "?",
    gradient: pickGradient(name),
    avatarColor: avatarColor ?? null,
  };
}

export async function fetchUsers(): Promise<ViewUser[]> {
  const rows = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarColor: true },
  });
  return rows.map((u) => toViewUser(u.name, u.id, u.avatarColor));
}

export interface ViewMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
  initial: string;
  gradient: AvatarGradient;
  avatarColor: string | null;
  joinedAt: Date;
  ownedProjects: number;
  assignedTasks: number;
  activeTasks: number;
}

export async function fetchTeamMembers(): Promise<ViewMember[]> {
  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          ownedProjects: { where: { archived: false } },
          assignedTasks: { where: { archived: false } },
        },
      },
      assignedTasks: {
        where: {
          archived: false,
          status: { notIn: ["DONE"] },
        },
        select: { id: true },
      },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    // 顯示優先序：自訂照片 > 自訂底色（此時 image=null，由 avatarColor 畫色塊）> Google 頭像
    image: u.avatarUrl ?? (u.avatarColor ? null : u.image),
    email: u.email,
    initial: u.name[0]?.toUpperCase() ?? "?",
    gradient: pickGradient(u.name),
    avatarColor: u.avatarColor,
    joinedAt: u.createdAt,
    ownedProjects: u._count.ownedProjects,
    assignedTasks: u._count.assignedTasks,
    activeTasks: u.assignedTasks.length,
  }));
}

export async function fetchProjects(): Promise<ViewProject[]> {
  const rows = await db.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { tasks: { where: { archived: false } } } },
      team: { select: { id: true, slug: true, name: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color as ProjectColor,
    taskCount: p._count.tasks,
    teamId: p.team?.id ?? null,
    teamSlug: p.team?.slug ?? null,
    teamName: p.team?.name ?? null,
    customerName: p.customerName ?? null,
    taxId: p.taxId ?? null,
    brandName: p.brandName ?? null,
  }));
}

// sidebar / topbar 顯示用：當前使用者的顯示名稱 + 解析後頭像（自訂 avatarUrl 優先）
export async function fetchUserAvatar(
  id: string
): Promise<{ name: string; image: string | null; avatarColor: string | null } | null> {
  const u = await db.user.findUnique({
    where: { id },
    select: { name: true, image: true, avatarUrl: true, avatarColor: true },
  });
  if (!u) return null;
  return {
    name: u.name,
    image: u.avatarUrl ?? (u.avatarColor ? null : u.image),
    avatarColor: u.avatarColor,
  };
}

export async function fetchTeams(): Promise<ViewTeam[]> {
  const rows = await db.team.findMany({ orderBy: { sort: "asc" } });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color as ProjectColor,
    sort: t.sort,
  }));
}

export interface ViewProjectDetail {
  id: string;
  name: string;
  color: ProjectColor;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  teamName: string | null;
  customerName: string | null;
  taxId: string | null;
  brandName: string | null;
  category: string | null;
  salesName: string | null;
  fileLinks: { label: string; url: string }[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export async function fetchProjectDetail(
  id: string
): Promise<ViewProjectDetail | null> {
  const p = await db.project.findUnique({
    where: { id, archived: false },
    include: {
      owner: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      tasks: { where: { archived: false }, select: { status: true } },
    },
  });
  if (!p) return null;
  const total = p.tasks.length;
  const done = p.tasks.filter((t) => t.status === "DONE").length;
  return {
    id: p.id,
    name: p.name,
    color: p.color as ProjectColor,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    ownerId: p.ownerId,
    ownerName: p.owner.name,
    teamId: p.team?.id ?? null,
    teamName: p.team?.name ?? null,
    customerName: p.customerName ?? null,
    taxId: p.taxId ?? null,
    brandName: p.brandName ?? null,
    category: p.category ?? null,
    salesName: p.salesName ?? null,
    fileLinks: Array.isArray(p.fileLinks)
      ? (p.fileLinks as { label: string; url: string }[])
      : [],
    totalTasks: total,
    completedTasks: done,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export async function fetchProjectDetails(): Promise<ViewProjectDetail[]> {
  const rows = await db.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      owner: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      tasks: { where: { archived: false }, select: { status: true } },
    },
  });
  return rows.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === "DONE").length;
    return {
      id: p.id,
      name: p.name,
      color: p.color as ProjectColor,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      ownerId: p.ownerId,
      ownerName: p.owner.name,
      teamId: p.team?.id ?? null,
      teamName: p.team?.name ?? null,
      customerName: p.customerName ?? null,
      taxId: p.taxId ?? null,
      brandName: p.brandName ?? null,
      category: p.category ?? null,
      salesName: p.salesName ?? null,
      fileLinks: Array.isArray(p.fileLinks)
        ? (p.fileLinks as { label: string; url: string }[])
        : [],
      totalTasks: total,
      completedTasks: done,
      completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
}

export interface ViewDocument {
  id: string;
  name: string;
  docType: DocType;
  date: Date | null;
  authorName: string | null;
}

export async function fetchDocuments(): Promise<ViewDocument[]> {
  const rows = await db.document.findMany({
    where: { archived: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } } },
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    docType: d.docType,
    date: d.date,
    authorName: d.author?.name ?? null,
  }));
}

export interface CalendarTask {
  id: string;
  title: string;
  status: import("@/lib/data").TaskStatus;
  priority: import("@/lib/data").TaskPriority;
  projectId: string | null;
  projectColor: ProjectColor | null;
  projectName: string | null;
  teamSlug: string | null;
  assignees: { id: string; name: string }[];
  dueDate: Date;
}

export async function fetchCalendarRangeTasks(
  start: Date,
  end: Date
): Promise<CalendarTask[]> {
  const rows = await db.task.findMany({
    where: {
      archived: false,
      dueDate: { gte: start, lt: end },
    },
    orderBy: { dueDate: "asc" },
    include: {
      project: { select: { name: true, color: true, team: { select: { slug: true } } } },
      team: { select: { slug: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  return rows
    .filter((r) => r.dueDate !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      projectId: r.projectId,
      projectColor: r.project ? (r.project.color as ProjectColor) : null,
      projectName: r.project?.name ?? null,
      // 專案的團隊優先，沒專案才用直屬 team
      teamSlug: r.project?.team?.slug ?? r.team?.slug ?? null,
      assignees: r.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
      dueDate: r.dueDate!,
    }));
}

export async function fetchCalendarTasks(
  year: number,
  month: number
): Promise<CalendarTask[]> {
  return fetchCalendarRangeTasks(
    new Date(year, month, 1),
    new Date(year, month + 1, 1)
  );
}

// 封存區 — 三類 archived
export interface ArchivedTask {
  id: string;
  title: string;
  status: import("@/lib/data").TaskStatus;
  projectName: string | null;
  archivedAt: Date;
}

export interface ArchivedDocument {
  id: string;
  name: string;
  docType: DocType;
  archivedAt: Date;
}

export interface ArchivedProject {
  id: string;
  name: string;
  color: ProjectColor;
  archivedAt: Date;
}

export async function fetchArchivedAll(): Promise<{
  tasks: ArchivedTask[];
  projects: ArchivedProject[];
  documents: ArchivedDocument[];
}> {
  const [tasks, projects, documents] = await Promise.all([
    db.task.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
      include: { project: { select: { name: true } } },
    }),
    db.project.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.document.findMany({
      where: { archived: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectName: t.project?.name ?? null,
      archivedAt: t.updatedAt,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color as ProjectColor,
      archivedAt: p.updatedAt,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.docType,
      archivedAt: d.updatedAt,
    })),
  };
}

export interface UpcomingTask {
  id: string;
  title: string;
  dueDateIso: string;
}

export async function fetchUpcomingTasks(): Promise<UpcomingTask[]> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const rows = await db.task.findMany({
    where: {
      archived: false,
      status: { notIn: ["DONE"] },
      dueDate: { gte: now, lte: in48h },
    },
    select: { id: true, title: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueDateIso: r.dueDate!.toISOString(),
  }));
}

export interface GanttTask {
  id: string;
  title: string;
  status: import("@/lib/data").TaskStatus;
  priority: import("@/lib/data").TaskPriority;
  dueDate: Date;
  startDate: Date; // 預設 dueDate - 7 day
  completionRate: number;
  projectColor: ProjectColor | null;
  assigneeName: string | null;
}

export async function fetchGanttTasks(projectId: string): Promise<GanttTask[]> {
  const rows = await db.task.findMany({
    where: { projectId, archived: false, dueDate: { not: null } },
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      project: { select: { color: true } },
      assignee: { select: { name: true } },
    },
  });
  const DAY = 24 * 60 * 60 * 1000;
  return rows.map((t) => {
    const due = t.dueDate!;
    // 真實 startDate 優先，沒設則 fallback dueDate - 7d（為了 bar 有寬度可看）
    const start = t.startDate ?? new Date(due.getTime() - 7 * DAY);
    const completionRate =
      t.status === "DONE"
        ? 100
        : t.status === "WAITING_REVIEW"
        ? 80
        : t.status === "IN_PROGRESS"
        ? 50
        : t.status === "TODO"
        ? 0
        : 0;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: due,
      startDate: start,
      completionRate,
      projectColor: t.project ? (t.project.color as ProjectColor) : null,
      assigneeName: t.assignee?.name ?? null,
    };
  });
}

export interface GanttProject {
  id: string;
  name: string;
  color: ProjectColor;
  startDate: Date | null;
  endDate: Date | null;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  isCompleted: boolean;
  teamSlug: string | null;
}

export async function fetchGanttProjects(): Promise<GanttProject[]> {
  const rows = await db.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      tasks: { where: { archived: false }, select: { status: true } },
      team: { select: { slug: true } },
    },
  });
  return rows.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === "DONE").length;
    return {
      id: p.id,
      name: p.name,
      color: p.color as ProjectColor,
      startDate: p.startDate,
      endDate: p.endDate,
      totalTasks: total,
      completedTasks: done,
      completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
      isCompleted: p.status === "DONE",
      teamSlug: p.team?.slug ?? null,
    };
  });
}

export async function fetchTasks(): Promise<ViewTask[]> {
  const rows = await db.task.findMany({
    where: { archived: false },
    orderBy: [{ status: "asc" }, { position: "asc" }],
    include: {
      assignee: true,
      assignees: { include: { user: true } },
      project: { select: { team: { select: { slug: true } } } },
      team: { select: { slug: true } },
      subtasks: { select: { id: true, status: true } },
      checklist: { select: { done: true } },
      _count: { select: { comments: true } },
    },
  });

  return rows.map((t): ViewTask => {
    const subtaskTotal = t.subtasks.length;
    const subtaskDone = t.subtasks.filter((s) => s.status === "DONE").length;
    const checklistTotal = t.checklist.length;
    const checklistDone = t.checklist.filter((c) => c.done).length;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      projectId: t.projectId,
      assignee: t.assignee
        ? toViewUser(t.assignee.name, t.assignee.id, t.assignee.avatarColor)
        : undefined,
      assignees: t.assignees.map((a) =>
        toViewUser(a.user.name, a.user.id, a.user.avatarColor)
      ),
      due: t.dueDate ? formatDue(t.dueDate, t.completedAt) : undefined,
      duePill: t.dueDate ? pickDuePill(t.dueDate, t.status) : undefined,
      startDateIso: t.startDate ? t.startDate.toISOString() : null,
      dueDateIso: t.dueDate ? t.dueDate.toISOString() : null,
      subtasks:
        subtaskTotal > 0 ? { done: subtaskDone, total: subtaskTotal } : undefined,
      checklist:
        checklistTotal > 0
          ? { done: checklistDone, total: checklistTotal }
          : undefined,
      commentCount: t._count.comments,
      // 專案的團隊優先，沒專案才用直屬 team（讓沒掛專案的卡也能歸隊）
      teamSlug: t.project?.team?.slug ?? t.team?.slug ?? null,
    };
  });
}

// ==== 卡片聯繫（TaskLink）====

export interface ViewTaskLink {
  id: string; // 對面那張卡的 id
  title: string;
  status: import("@/lib/data").TaskStatus;
  teamName: string | null;
  projectName: string | null;
}

// 某任務的聯繫卡片：雙向 union（A→B 與 B→A 都算），回傳「對面那張卡」，去重。
export async function fetchTaskLinks(taskId: string): Promise<ViewTaskLink[]> {
  const sel = {
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { name: true, team: { select: { name: true } } } },
    },
  } as const;
  const rows = await db.taskLink.findMany({
    where: { OR: [{ taskId }, { linkedId: taskId }] },
    include: { task: sel, linked: sel },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const out: ViewTaskLink[] = [];
  for (const r of rows) {
    const other = r.taskId === taskId ? r.linked : r.task;
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    out.push({
      id: other.id,
      title: other.title,
      status: other.status,
      teamName: other.project?.team?.name ?? null,
      projectName: other.project?.name ?? null,
    });
  }
  return out;
}

export interface ViewTaskPeek {
  id: string;
  title: string;
  description: string | null;
  status: import("@/lib/data").TaskStatus;
  priority: import("@/lib/data").TaskPriority;
  assigneeName: string | null;
  projectName: string | null;
  teamName: string | null;
  dueIso: string | null;
}

// peek 預覽：點聯繫卡片時跳出的唯讀詳情
export async function fetchTaskPeek(id: string): Promise<ViewTaskPeek | null> {
  const t = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { name: true } },
      project: { select: { name: true, team: { select: { name: true } } } },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeName: t.assignee?.name ?? null,
    projectName: t.project?.name ?? null,
    teamName: t.project?.team?.name ?? null,
    dueIso: t.dueDate ? t.dueDate.toISOString() : null,
  };
}

// 可聯繫的候選卡片（picker 用）：所有未封存任務，排除自己；前端再過濾已聯繫 + 關鍵字。
export async function fetchLinkableTasks(
  taskId: string
): Promise<ViewTaskLink[]> {
  const rows = await db.task.findMany({
    where: { archived: false, id: { not: taskId } },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { name: true, team: { select: { name: true } } } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    teamName: t.project?.team?.name ?? null,
    projectName: t.project?.name ?? null,
  }));
}

// 某任務的工作清單，依 position 正序
export async function fetchTaskChecklist(
  taskId: string
): Promise<ViewChecklistItem[]> {
  const items = await db.checklistItem.findMany({
    where: { taskId },
    orderBy: { position: "asc" },
  });
  return items.map((i) => ({
    id: i.id,
    content: i.content,
    done: i.done,
    position: i.position,
  }));
}

// 某任務的留言 + 活動軌跡，合併後依時間正序（舊→新）排列
export async function fetchTaskTimeline(
  taskId: string
): Promise<ViewTimelineItem[]> {
  const [comments, activities] = await Promise.all([
    db.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true, avatarColor: true } } },
    }),
    db.activity.findMany({
      where: { taskId },
      include: { actor: { select: { id: true, name: true } } },
    }),
  ]);

  const commentItems: ViewTimelineItem[] = comments.map((c) => ({
    kind: "comment",
    id: c.id,
    body: c.body,
    author: toTimelineAuthor(c.author),
    createdAtIso: c.createdAt.toISOString(),
    edited: c.updatedAt.getTime() - c.createdAt.getTime() > 1000,
  }));

  const activityItems: ViewTimelineItem[] = activities.map((a) => ({
    kind: "activity",
    id: a.id,
    field: a.field,
    fromValue: a.fromValue,
    toValue: a.toValue,
    actor: toTimelineAuthor(a.actor),
    createdAtIso: a.createdAt.toISOString(),
  }));

  return [...commentItems, ...activityItems].sort(
    (a, b) => a.createdAtIso.localeCompare(b.createdAtIso)
  );
}

function toTimelineAuthor(
  u: { id: string; name: string; avatarColor?: string | null } | null
): TimelineAuthor {
  if (!u) {
    return { id: null, name: "已移除使用者", initial: "?", gradient: "y" };
  }
  return {
    id: u.id,
    name: u.name,
    initial: u.name[0] ?? "?",
    gradient: pickGradient(u.name),
    avatarColor: u.avatarColor ?? null,
  };
}

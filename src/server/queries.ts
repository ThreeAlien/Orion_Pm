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

function toViewUser(name: string, id: string): ViewUser {
  return {
    id,
    name,
    initial: name[0] ?? "?",
    gradient: pickGradient(name),
  };
}

export async function fetchUsers(): Promise<ViewUser[]> {
  const rows = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((u) => toViewUser(u.name, u.id));
}

export interface ViewMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
  initial: string;
  gradient: AvatarGradient;
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
    email: u.email,
    image: u.image,
    initial: u.name[0]?.toUpperCase() ?? "?",
    gradient: pickGradient(u.name),
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
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color as ProjectColor,
    taskCount: p._count.tasks,
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
      project: { select: { name: true, color: true } },
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
  blockedByIds: string[];
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
      blockedBy: { select: { blockerId: true } },
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
      blockedByIds: t.blockedBy.map((b) => b.blockerId),
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
}

export async function fetchGanttProjects(): Promise<GanttProject[]> {
  const rows = await db.project.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
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
      startDate: p.startDate,
      endDate: p.endDate,
      totalTasks: total,
      completedTasks: done,
      completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
      isCompleted: p.status === "DONE",
    };
  });
}

export async function fetchTasks(): Promise<ViewTask[]> {
  const rows = await db.task.findMany({
    where: { archived: false },
    orderBy: [{ status: "asc" }, { position: "asc" }],
    include: {
      assignee: true,
      blockedBy: { take: 1, select: { blockerId: true } },
      subtasks: { select: { id: true, status: true } },
    },
  });

  return rows.map((t): ViewTask => {
    const subtaskTotal = t.subtasks.length;
    const subtaskDone = t.subtasks.filter((s) => s.status === "DONE").length;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      projectId: t.projectId,
      assignee: t.assignee
        ? toViewUser(t.assignee.name, t.assignee.id)
        : undefined,
      due: t.dueDate ? formatDue(t.dueDate, t.completedAt) : undefined,
      duePill: t.dueDate ? pickDuePill(t.dueDate, t.status) : undefined,
      startDateIso: t.startDate ? t.startDate.toISOString() : null,
      dueDateIso: t.dueDate ? t.dueDate.toISOString() : null,
      subtasks:
        subtaskTotal > 0 ? { done: subtaskDone, total: subtaskTotal } : undefined,
      hasDependency: t.blockedBy.length > 0,
    };
  });
}

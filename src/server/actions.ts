"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import {
  fetchTaskTimeline,
  fetchTaskChecklist,
  fetchTaskDependencies,
} from "@/server/queries";
import {
  TaskStatus,
  TaskPriority,
  ActivityField,
} from "@/generated/prisma/client";

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// 活動軌跡：fromValue / toValue 一律寫入當下的人類可讀字串（label / 名字 / 日期）
async function logActivity(
  taskId: string,
  actorId: string | null,
  field: ActivityField,
  fromValue: string | null,
  toValue: string | null
) {
  await db.activity.create({
    data: { taskId, actorId, field, fromValue, toValue },
  });
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

async function resolveUserName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name ?? null;
}

const TASK_STATUSES = [
  "TODO",
  "DISCUSSING",
  "ON_HOLD",
  "IN_PROGRESS",
  "WAITING_REVIEW",
  "DONE",
] as const satisfies readonly TaskStatus[];

const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly TaskPriority[];

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, "請輸入標題").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export type CreateTaskResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTask(
  raw: unknown
): Promise<CreateTaskResult> {
  const parsed = CreateTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" };
  }
  const data = parsed.data;

  // 算 position：放該 status 最末
  const last = await db.task.findFirst({
    where: { status: data.status, archived: false },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? 0) + 1024;

  const actorId = await currentUserId();
  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description?.trim() || null,
      status: data.status,
      priority: data.priority,
      projectId: data.projectId || null,
      assigneeId: data.assigneeId || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      position: nextPosition,
    },
  });
  await logActivity(task.id, actorId, "CREATED", null, null);

  // 重新整理 dashboard / tasks / projects 三頁
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");

  return { ok: true, id: task.id };
}

const UpdateTaskStatusSchema = z.object({
  id: z.string(),
  status: z.enum(TASK_STATUSES),
});

export async function updateTaskStatus(raw: unknown) {
  const { id, status } = UpdateTaskStatusSchema.parse(raw);
  const old = await db.task.findUnique({ where: { id }, select: { status: true } });
  await db.task.update({
    where: { id },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  if (old && old.status !== status) {
    await logActivity(
      id,
      await currentUserId(),
      "STATUS",
      STATUS_LABELS[old.status],
      STATUS_LABELS[status]
    );
  }
  revalidatePath("/");
  revalidatePath("/tasks");
}

const UpdateTaskSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export async function updateTask(raw: unknown) {
  const data = UpdateTaskSchema.parse(raw);
  const newAssigneeId = data.assigneeId || null;
  const old = await db.task.findUnique({
    where: { id: data.id },
    select: {
      status: true,
      priority: true,
      assigneeId: true,
      startDate: true,
      dueDate: true,
      assignee: { select: { name: true } },
    },
  });
  await db.task.update({
    where: { id: data.id },
    data: {
      title: data.title,
      description: data.description?.trim() || null,
      status: data.status,
      priority: data.priority,
      projectId: data.projectId || null,
      assigneeId: newAssigneeId,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
  });

  if (old) {
    const actorId = await currentUserId();
    if (old.status !== data.status) {
      await logActivity(data.id, actorId, "STATUS", STATUS_LABELS[old.status], STATUS_LABELS[data.status]);
    }
    if (old.priority !== data.priority) {
      await logActivity(data.id, actorId, "PRIORITY", PRIORITY_LABELS[old.priority], PRIORITY_LABELS[data.priority]);
    }
    if (old.assigneeId !== newAssigneeId) {
      await logActivity(data.id, actorId, "ASSIGNEE", old.assignee?.name ?? null, await resolveUserName(newAssigneeId));
    }
    const oldStart = fmtDate(old.startDate);
    const newStart = data.startDate || null;
    if (oldStart !== newStart) {
      await logActivity(data.id, actorId, "START_DATE", oldStart, newStart);
    }
    const oldDue = fmtDate(old.dueDate);
    const newDue = data.dueDate || null;
    if (oldDue !== newDue) {
      await logActivity(data.id, actorId, "DUE_DATE", oldDue, newDue);
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
}

const UpdateTaskDueDateSchema = z.object({
  id: z.string(),
  dueDate: z.string(), // ISO 字串
});

export async function updateTaskDueDate(raw: unknown) {
  const { id, dueDate } = UpdateTaskDueDateSchema.parse(raw);
  const old = await db.task.findUnique({ where: { id }, select: { dueDate: true } });
  const newDue = new Date(dueDate);
  await db.task.update({
    where: { id },
    data: { dueDate: newDue },
  });
  const oldDueStr = fmtDate(old?.dueDate ?? null);
  const newDueStr = fmtDate(newDue);
  if (oldDueStr !== newDueStr) {
    await logActivity(id, await currentUserId(), "DUE_DATE", oldDueStr, newDueStr);
  }
  revalidatePath("/");
  revalidatePath("/gantt");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

const UpdateProjectDatesSchema = z.object({
  id: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export async function updateProjectDates(raw: unknown) {
  const data = UpdateProjectDatesSchema.parse(raw);
  await db.project.update({
    where: { id: data.id },
    data: {
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
    },
  });
  revalidatePath("/gantt");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  await db.task.update({
    where: { id },
    data: { archived: true },
  });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
}

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // 接受任何 hex (#RRGGBB) 或 named token
  color: z.string().min(1).max(40),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  ownerId: z.string(),
});

const PROJECT_STATUSES = ["PLANNING", "PAUSED", "IN_PROGRESS", "DONE"] as const;

const UpdateProjectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  color: z.string().min(1).max(40),
  status: z.enum(PROJECT_STATUSES),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  ownerId: z.string(),
});

export async function updateProject(raw: unknown) {
  const data = UpdateProjectSchema.parse(raw);
  await db.project.update({
    where: { id: data.id },
    data: {
      name: data.name,
      color: data.color,
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      ownerId: data.ownerId,
    },
  });
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${data.id}`);
  revalidatePath("/gantt");
}

export async function archiveProject(id: string) {
  await db.project.update({
    where: { id },
    data: { archived: true },
  });
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/gantt");
  revalidatePath("/archive");
}

// ==== 還原（從封存區）====

export async function unarchiveTask(id: string) {
  await db.task.update({ where: { id }, data: { archived: false } });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/archive");
}

export async function unarchiveProject(id: string) {
  await db.project.update({ where: { id }, data: { archived: false } });
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/gantt");
  revalidatePath("/archive");
}

export async function unarchiveDocument(id: string) {
  await db.document.update({ where: { id }, data: { archived: false } });
  revalidatePath("/documents");
  revalidatePath("/archive");
}

export async function removeMember(
  userId: string,
  fallbackOwnerId: string
): Promise<{ ok: boolean; error?: string }> {
  if (userId === fallbackOwnerId) {
    return { ok: false, error: "不能移除自己" };
  }
  // 該 user 擁有的專案 → ownership 轉給 fallback（呼叫者）
  await db.project.updateMany({
    where: { ownerId: userId },
    data: { ownerId: fallbackOwnerId },
  });
  // assignee / author 走 onDelete: SetNull 自動處理
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/members");
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/documents");
  return { ok: true };
}

export async function createProject(raw: unknown) {
  const data = CreateProjectSchema.parse(raw);
  const project = await db.project.create({
    data: {
      name: data.name,
      color: data.color,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      ownerId: data.ownerId,
      status: "PLANNING",
    },
  });
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/gantt");
  return { ok: true as const, id: project.id };
}

const DOC_TYPES = [
  "MEETING",
  "RESEARCH",
  "DEV_NOTE",
  "PRODUCT",
  "TEST",
  "TEAM_GUIDE",
] as const;

const CreateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  docType: z.enum(DOC_TYPES),
  date: z.string().nullable().optional(),
  authorId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

const UpdateDocumentSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(200),
  docType: z.enum(DOC_TYPES),
  date: z.string().nullable().optional(),
  authorId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export async function updateDocument(raw: unknown) {
  const data = UpdateDocumentSchema.parse(raw);
  // 更新主欄位
  await db.document.update({
    where: { id: data.id },
    data: {
      name: data.name,
      docType: data.docType,
      date: data.date ? new Date(data.date) : null,
      authorId: data.authorId || null,
    },
  });
  // 同步 ProjectDocument 中介表（先清舊，再加新）
  await db.projectDocument.deleteMany({ where: { documentId: data.id } });
  if (data.projectId) {
    await db.projectDocument.create({
      data: { documentId: data.id, projectId: data.projectId },
    });
  }
  revalidatePath("/documents");
}

export async function archiveDocument(id: string) {
  await db.document.update({ where: { id }, data: { archived: true } });
  revalidatePath("/documents");
}

export async function createDocument(raw: unknown) {
  const data = CreateDocumentSchema.parse(raw);
  const doc = await db.document.create({
    data: {
      name: data.name,
      docType: data.docType,
      date: data.date ? new Date(data.date) : null,
      authorId: data.authorId || null,
      projects: data.projectId
        ? { create: { projectId: data.projectId } }
        : undefined,
    },
  });
  revalidatePath("/documents");
  return { ok: true as const, id: doc.id };
}

// ==================== 留言（Comment）====================

const AddCommentSchema = z.object({
  taskId: z.string(),
  body: z.string().trim().min(1, "請輸入留言").max(2000),
});

const UpdateCommentSchema = z.object({
  id: z.string(),
  body: z.string().trim().min(1, "請輸入留言").max(2000),
});

export type CommentResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function addComment(raw: unknown): Promise<CommentResult> {
  const parsed = AddCommentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" };
  }
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };

  const comment = await db.comment.create({
    data: { taskId: parsed.data.taskId, body: parsed.data.body, authorId: uid },
  });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  return { ok: true, id: comment.id };
}

export async function updateComment(raw: unknown): Promise<CommentResult> {
  const parsed = UpdateCommentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" };
  }
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };

  const existing = await db.comment.findUnique({
    where: { id: parsed.data.id },
    select: { authorId: true },
  });
  if (!existing) return { ok: false, error: "留言不存在" };
  if (existing.authorId !== uid) return { ok: false, error: "只能編輯自己的留言" };

  await db.comment.update({
    where: { id: parsed.data.id },
    data: { body: parsed.data.body },
  });
  revalidatePath("/");
  return { ok: true, id: parsed.data.id };
}

export async function deleteComment(id: string): Promise<CommentResult> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };

  const existing = await db.comment.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!existing) return { ok: false, error: "留言不存在" };
  if (existing.authorId !== uid) return { ok: false, error: "只能刪除自己的留言" };

  await db.comment.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  return { ok: true, id };
}

// drawer（client）載入某任務的留言 + 活動軌跡時間軸
export async function getTaskTimeline(taskId: string) {
  return fetchTaskTimeline(taskId);
}

// ==================== 工作清單（ChecklistItem）====================

const AddChecklistSchema = z.object({
  taskId: z.string(),
  content: z.string().trim().min(1, "請輸入內容").max(500),
});

const UpdateChecklistSchema = z.object({
  id: z.string(),
  content: z.string().trim().min(1, "請輸入內容").max(500),
});

function revalidateTaskViews() {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
}

export async function addChecklistItem(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = AddChecklistSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" };
  }
  const last = await db.checklistItem.findFirst({
    where: { taskId: parsed.data.taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const item = await db.checklistItem.create({
    data: {
      taskId: parsed.data.taskId,
      content: parsed.data.content,
      position: (last?.position ?? 0) + 1024,
    },
  });
  revalidateTaskViews();
  return { ok: true, id: item.id };
}

export async function toggleChecklistItem(raw: unknown) {
  const { id, done } = z.object({ id: z.string(), done: z.boolean() }).parse(raw);
  await db.checklistItem.update({ where: { id }, data: { done } });
  revalidateTaskViews();
}

export async function updateChecklistItem(
  raw: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdateChecklistSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" };
  }
  await db.checklistItem.update({
    where: { id: parsed.data.id },
    data: { content: parsed.data.content },
  });
  revalidateTaskViews();
  return { ok: true };
}

export async function deleteChecklistItem(id: string) {
  await db.checklistItem.delete({ where: { id } });
  revalidateTaskViews();
}

// 拖排：client 算好新 position（相鄰兩項中點）傳進來
export async function reorderChecklistItem(raw: unknown) {
  const { id, position } = z
    .object({ id: z.string(), position: z.number() })
    .parse(raw);
  await db.checklistItem.update({ where: { id }, data: { position } });
  revalidatePath("/");
}

export async function getTaskChecklist(taskId: string) {
  return fetchTaskChecklist(taskId);
}

// ==================== 任務依賴（TaskDependency）====================
// 邊方向：blocker → blocked（blocker 要先完成，blocked 才能進行）

const DependencySchema = z.object({
  blockedId: z.string(),
  blockerId: z.string(),
});

// 加入邊 blockerId → blockedId 是否會成環：
// 若 blockedId 順著 blocker→blocked 已能走到 blockerId，加了就形成循環
async function wouldCreateCycle(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  const deps = await db.taskDependency.findMany({
    select: { blockerId: true, blockedId: true },
  });
  const adj = new Map<string, string[]>();
  for (const d of deps) {
    const arr = adj.get(d.blockerId);
    if (arr) arr.push(d.blockedId);
    else adj.set(d.blockerId, [d.blockedId]);
  }
  const stack = [blockedId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === blockerId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

export async function addDependency(
  raw: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { blockedId, blockerId } = DependencySchema.parse(raw);
  if (blockedId === blockerId) {
    return { ok: false, error: "任務不能依賴自己" };
  }
  const exists = await db.taskDependency.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  if (exists) return { ok: false, error: "已經有這個依賴了" };
  if (await wouldCreateCycle(blockerId, blockedId)) {
    return { ok: false, error: "會造成循環依賴，無法加入" };
  }
  await db.taskDependency.create({ data: { blockerId, blockedId } });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/gantt");
  return { ok: true };
}

export async function removeDependency(raw: unknown) {
  const { blockedId, blockerId } = DependencySchema.parse(raw);
  await db.taskDependency.delete({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/gantt");
}

export async function getTaskDependencies(taskId: string) {
  return fetchTaskDependencies(taskId);
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { TEAM_COOKIE } from "@/lib/team-scope";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/labels";
import {
  fetchTaskTimeline,
  fetchTaskChecklist,
  fetchTaskLinks,
  fetchLinkableTasks,
  fetchTaskPeek,
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

// 全域團隊範圍：寫進 cookie，給所有 view server-side 過濾。"all" 或 team slug。
export async function setTeamScope(slug: string) {
  const c = await cookies();
  c.set(TEAM_COOKIE, slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

// 團隊改名 / 換色
const UpdateTeamSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(40),
  color: z.string().min(1).max(40),
});

export async function updateTeam(raw: unknown) {
  const data = UpdateTeamSchema.parse(raw);
  await db.team.update({
    where: { id: data.id },
    data: { name: data.name, color: data.color },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

// 個人資料自助編輯：使用者改自己的姓名 / 頭貼。
// avatarUrl 存壓縮後的 webp data URL（無物件儲存，直接進 DB）；null = 清掉自訂、回退 Google 頭像。
const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  avatarUrl: z.string().nullable().optional(),
  avatarColor: z.string().max(40).nullable().optional(),
});

export async function updateMyProfile(raw: unknown) {
  const uid = await currentUserId();
  if (!uid) return { ok: false as const, error: "未登入" };
  const data = UpdateProfileSchema.parse(raw);
  // 防呆：base64 webp 頭貼應該很小（128px ~ 數 KB），超過 200KB 視為異常擋掉
  if (data.avatarUrl && data.avatarUrl.length > 200_000) {
    return { ok: false as const, error: "頭貼檔案太大，請換小一點的圖" };
  }
  // 只允許 data:image webp/png/jpeg，擋掉外部 URL 注入夾帶
  if (data.avatarUrl && !/^data:image\/(webp|png|jpeg);base64,/.test(data.avatarUrl)) {
    return { ok: false as const, error: "頭貼格式不支援" };
  }
  await db.user.update({
    where: { id: uid },
    data: {
      name: data.name,
      avatarUrl: data.avatarUrl ?? null,
      // avatarColor 只在「沒上傳照片」時生效；undefined 不動、null 清掉
      ...(data.avatarColor !== undefined
        ? { avatarColor: data.avatarColor }
        : {}),
    },
  });
  revalidatePath("/", "layout");
  revalidatePath("/members");
  return { ok: true as const };
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

// 從富文本 HTML 抽出被 @ 的 userId（quill-mention 產生 <span class="mention" data-id="...">）
function parseMentionUserIds(html: string | null | undefined): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  const re = /data-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

// 對 userIds 中真實存在的使用者建立「被 @」通知（呼叫端先排除自己 / 舊內容已提及的人）
async function createMentionNotifications(opts: {
  userIds: string[];
  actorName: string | null;
  taskId: string;
  commentId?: string | null;
}) {
  const recipients = [...new Set(opts.userIds)].filter(Boolean);
  if (recipients.length === 0) return;
  const valid = await db.user.findMany({
    where: { id: { in: recipients } },
    select: { id: true },
  });
  if (valid.length === 0) return;
  await db.notification.createMany({
    data: valid.map((u) => ({
      recipientId: u.id,
      type: "MENTION",
      actorName: opts.actorName,
      taskId: opts.taskId,
      commentId: opts.commentId ?? null,
    })),
  });
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
  description: z.string().trim().max(50000).optional().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  projectId: z.string().nullable().optional(),
  // 直屬團隊：沒掛專案時讓卡片歸隊（有專案時顯示跟著專案的團隊走）
  teamId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  // 多負責人；沒給就退回單一 assigneeId（外部 API 相容）
  assigneeIds: z.array(z.string()).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

// 統一算負責人清單：優先 assigneeIds，否則退回單一 assigneeId
function resolveAssigneeIds(data: {
  assigneeIds?: string[];
  assigneeId?: string | null;
}): string[] {
  const ids = data.assigneeIds ?? (data.assigneeId ? [data.assigneeId] : []);
  return [...new Set(ids.filter(Boolean))];
}

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
  const assigneeIds = resolveAssigneeIds(data);
  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description?.trim() || null,
      status: data.status,
      priority: data.priority,
      projectId: data.projectId || null,
      // 有專案時 teamId 留著也無妨（顯示以專案團隊為準）；沒專案才靠它歸隊
      teamId: data.teamId || null,
      assigneeId: assigneeIds[0] ?? null, // 主負責人 = 第一位
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      position: nextPosition,
    },
  });
  await logActivity(task.id, actorId, "CREATED", null, null);

  // 描述裡被 @ 的人收到通知（排除自己）
  await createMentionNotifications({
    userIds: parseMentionUserIds(data.description).filter((id) => id !== actorId),
    actorName: await resolveUserName(actorId),
    taskId: task.id,
  });

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
  description: z.string().trim().max(50000).nullable().optional(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export async function updateTask(raw: unknown) {
  const data = UpdateTaskSchema.parse(raw);
  const assigneeIds = resolveAssigneeIds(data);
  const newAssigneeId = assigneeIds[0] ?? null; // 主負責人 = 第一位
  const old = await db.task.findUnique({
    where: { id: data.id },
    select: {
      status: true,
      priority: true,
      assigneeId: true,
      startDate: true,
      dueDate: true,
      description: true,
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
      // 同步多負責人：先清掉舊的再建新的
      assignees: {
        deleteMany: {},
        create: assigneeIds.map((userId) => ({ userId })),
      },
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
    // 描述裡「新增」的 @（舊描述沒有、自己除外）才發通知，避免每次編輯都重發
    const oldMentions = new Set(parseMentionUserIds(old.description));
    const addedMentions = parseMentionUserIds(data.description).filter(
      (id) => !oldMentions.has(id) && id !== actorId,
    );
    if (addedMentions.length > 0) {
      await createMentionNotifications({
        userIds: addedMentions,
        actorName: await resolveUserName(actorId),
        taskId: data.id,
      });
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
  teamId: z.string().nullable().optional(),
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
  teamId: z.string().nullable().optional(),
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
      teamId: data.teamId || null,
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
      teamId: data.teamId || null,
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
  body: z.string().trim().min(1, "請輸入留言").max(50000),
});

const UpdateCommentSchema = z.object({
  id: z.string(),
  body: z.string().trim().min(1, "請輸入留言").max(50000),
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

  const me = await db.user.findUnique({ where: { id: uid }, select: { name: true } });
  const comment = await db.comment.create({
    data: { taskId: parsed.data.taskId, body: parsed.data.body, authorId: uid },
  });
  // 被 @ 的人收到通知（排除自己）
  await createMentionNotifications({
    userIds: parseMentionUserIds(parsed.data.body).filter((id) => id !== uid),
    actorName: me?.name ?? null,
    taskId: parsed.data.taskId,
    commentId: comment.id,
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

// ==================== 卡片聯繫（TaskLink）====================
// 跨團隊交流：兩張卡互相參考 + peek 預覽，無 blocking / 排序語意。雙向去重。

const TaskLinkSchema = z.object({
  taskId: z.string(),
  linkedId: z.string(),
});

export async function addTaskLink(
  raw: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { taskId, linkedId } = TaskLinkSchema.parse(raw);
  if (taskId === linkedId) return { ok: false, error: "不能聯繫自己" };
  const exists = await db.taskLink.findFirst({
    where: {
      OR: [
        { taskId, linkedId },
        { taskId: linkedId, linkedId: taskId },
      ],
    },
  });
  if (exists) return { ok: false, error: "已經聯繫過這張卡了" };
  await db.taskLink.create({ data: { taskId, linkedId } });
  revalidatePath("/");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function removeTaskLink(raw: unknown) {
  const { taskId, linkedId } = TaskLinkSchema.parse(raw);
  await db.taskLink.deleteMany({
    where: {
      OR: [
        { taskId, linkedId },
        { taskId: linkedId, linkedId: taskId },
      ],
    },
  });
  revalidatePath("/");
  revalidatePath("/tasks");
}

export async function getTaskLinks(taskId: string) {
  return fetchTaskLinks(taskId);
}

export async function getLinkableTasks(taskId: string) {
  return fetchLinkableTasks(taskId);
}

export async function getTaskPeek(id: string) {
  return fetchTaskPeek(id);
}

// ==================== 通知（被 @ 提及）====================

export type ViewNotification = {
  id: string;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  read: boolean;
  createdAtIso: string;
};

// 我的通知（最近 30 筆，新到舊）
export async function fetchMyNotifications(): Promise<ViewNotification[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const rows = await db.notification.findMany({
    where: { recipientId: uid },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      actorName: true,
      taskId: true,
      read: true,
      createdAt: true,
      task: { select: { title: true } },
    },
  });
  return rows.map((n) => ({
    id: n.id,
    actorName: n.actorName,
    taskId: n.taskId,
    taskTitle: n.task?.title ?? null,
    read: n.read,
    createdAtIso: n.createdAt.toISOString(),
  }));
}

// 看板卡片標色用：我還沒讀的「被 @」通知對應的 taskId 清單
export async function fetchUnreadMentionTaskIds(): Promise<string[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const rows = await db.notification.findMany({
    where: { recipientId: uid, read: false, type: "MENTION", taskId: { not: null } },
    select: { taskId: true },
    distinct: ["taskId"],
  });
  return rows.map((r) => r.taskId).filter((id): id is string => !!id);
}

export async function markAllNotificationsRead() {
  const uid = await currentUserId();
  if (!uid) return { ok: false as const };
  await db.notification.updateMany({
    where: { recipientId: uid, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

// 開某張卡時，把該卡的未讀通知標已讀（卡片標色消失）
export async function markTaskNotificationsRead(taskId: string) {
  const uid = await currentUserId();
  if (!uid) return { ok: false as const };
  await db.notification.updateMany({
    where: { recipientId: uid, taskId, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

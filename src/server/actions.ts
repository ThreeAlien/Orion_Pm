"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  TaskStatus,
  TaskPriority,
} from "@/generated/prisma/client";

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
  await db.task.update({
    where: { id },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
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
  await db.task.update({
    where: { id: data.id },
    data: {
      title: data.title,
      description: data.description?.trim() || null,
      status: data.status,
      priority: data.priority,
      projectId: data.projectId || null,
      assigneeId: data.assigneeId || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
  });
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
  await db.task.update({
    where: { id },
    data: { dueDate: new Date(dueDate) },
  });
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

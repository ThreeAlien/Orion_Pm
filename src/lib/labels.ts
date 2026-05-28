// 狀態 / 優先級的中文 label — server action（活動軌跡）與 client（時間軸渲染）共用，避免漂掉。
import type { TaskStatus, TaskPriority } from "@/generated/prisma/client";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "尚未開始",
  DISCUSSING: "討論中",
  ON_HOLD: "擱置",
  IN_PROGRESS: "進行中",
  WAITING_REVIEW: "等待驗收",
  DONE: "已完成",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

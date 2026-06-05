"use server";

// 行事曆「事件」server actions：純 proxy 同步 Google Calendar（不落地本地表，避免雙寫同步問題）。
// 顯示靠讀 Google；建立/編輯/刪除直接打 Google API，下次重整就反映。
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  insertGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@/server/google-calendar";

async function currentUserId(): Promise<string | null> {
  const s = await auth();
  return s?.user?.id ?? null;
}

const EventSchema = z.object({
  title: z.string().trim().min(1, "請輸入標題").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  start: z.string(), // ISO
  end: z.string(),
  allDay: z.boolean().optional(),
});

type ActionResult = { ok: true } | { ok: false; error: string };

function reasonToMsg(reason: string): string {
  if (reason === "needs_reauth") return "Google 授權已過期，請重新登入連結";
  if (reason === "no_token") return "尚未連結 Google 行事曆，請用 Google 重新登入";
  return "操作失敗，請稍後再試";
}

export async function createCalendarEvent(raw: unknown): Promise<ActionResult> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };
  const d = EventSchema.parse(raw);
  const res = await insertGoogleEvent(uid, {
    title: d.title,
    description: d.description ?? null,
    location: d.location ?? null,
    start: new Date(d.start),
    end: new Date(d.end),
    allDay: !!d.allDay,
  });
  if (!res.ok) return { ok: false, error: reasonToMsg(res.reason) };
  revalidatePath("/calendar");
  return { ok: true };
}

const UpdateEventSchema = EventSchema.extend({ googleEventId: z.string() });

export async function updateCalendarEvent(raw: unknown): Promise<ActionResult> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };
  const d = UpdateEventSchema.parse(raw);
  const res = await updateGoogleEvent(uid, d.googleEventId, {
    title: d.title,
    description: d.description ?? null,
    location: d.location ?? null,
    start: new Date(d.start),
    end: new Date(d.end),
    allDay: !!d.allDay,
  });
  if (!res.ok) return { ok: false, error: reasonToMsg(res.reason) };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteCalendarEvent(
  googleEventId: string
): Promise<ActionResult> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: "未登入" };
  const res = await deleteGoogleEvent(uid, googleEventId);
  if (!res.ok) return { ok: false, error: "刪除失敗（可能授權過期）" };
  revalidatePath("/calendar");
  return { ok: true };
}

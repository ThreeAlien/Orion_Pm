// Google Calendar 串接後端：token 換新 + Calendar API 讀寫。
// 這層純 code，等 GCP consent screen 加好 calendar.events scope + 使用者重新授權後就會運作。
import "server-only";
import { db } from "@/lib/db";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export type TokenResult =
  | { ok: true; accessToken: string }
  // no_token = 沒授權過 Google；needs_reauth = refresh token 失效（撤銷 / Testing 7 天到期）
  | { ok: false; reason: "no_token" | "needs_reauth" };

// 取有效 access token：沒過期直接用，過期就用 refresh token 換新並寫回 DB。
export async function getValidAccessToken(userId: string): Promise<TokenResult> {
  const tok = await db.googleToken.findUnique({ where: { userId } });
  if (!tok || (!tok.refreshToken && !tok.accessToken)) {
    return { ok: false, reason: "no_token" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (tok.accessToken && tok.expiresAt && tok.expiresAt > now + 60) {
    return { ok: true, accessToken: tok.accessToken };
  }
  if (!tok.refreshToken) return { ok: false, reason: "needs_reauth" };

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      refresh_token: tok.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // 多半是 invalid_grant：refresh token 被撤銷或 7 天到期 → 要重新授權
    return { ok: false, reason: "needs_reauth" };
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresAt = now + (data.expires_in ?? 3600);
  await db.googleToken.update({
    where: { userId },
    data: { accessToken: data.access_token, expiresAt },
  });
  return { ok: true, accessToken: data.access_token };
}

async function calFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export interface GCalEvent {
  googleEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
}

// Google 的 event.start/end 可能是 { dateTime } 或全天的 { date }
function parseGTime(t: { dateTime?: string; date?: string } | undefined): {
  date: Date;
  allDay: boolean;
} {
  if (t?.dateTime) return { date: new Date(t.dateTime), allDay: false };
  if (t?.date) return { date: new Date(t.date + "T00:00:00"), allDay: true };
  return { date: new Date(0), allDay: false };
}

interface RawGEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function mapGEvent(e: RawGEvent): GCalEvent {
  const s = parseGTime(e.start);
  const en = parseGTime(e.end);
  return {
    googleEventId: e.id,
    title: e.summary ?? "(無標題)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: s.date,
    end: en.date,
    allDay: s.allDay,
  };
}

export type ListResult =
  | { ok: true; events: GCalEvent[] }
  | { ok: false; reason: "no_token" | "needs_reauth" | "api_error" };

// 讀某時間區間的 Google 事件（singleEvents 展開遞迴事件，月曆才不會缺格）
export async function listGoogleEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<ListResult> {
  const t = await getValidAccessToken(userId);
  if (!t.ok) return { ok: false, reason: t.reason };
  const qs = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await calFetch(t.accessToken, `/calendars/primary/events?${qs}`);
  if (!res.ok) return { ok: false, reason: "api_error" };
  const data = (await res.json()) as { items?: RawGEvent[] };
  return { ok: true, events: (data.items ?? []).map(mapGEvent) };
}

interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
}

function toGBody(ev: EventInput) {
  if (ev.allDay) {
    const d = (x: Date) => x.toISOString().slice(0, 10);
    return {
      summary: ev.title,
      description: ev.description ?? undefined,
      location: ev.location ?? undefined,
      start: { date: d(ev.start) },
      end: { date: d(ev.end) },
    };
  }
  return {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: { dateTime: ev.start.toISOString() },
    end: { dateTime: ev.end.toISOString() },
  };
}

export type WriteResult =
  | { ok: true; googleEventId: string }
  | { ok: false; reason: "no_token" | "needs_reauth" | "api_error" };

// 我方建立事件 → push 到 Google，回傳 googleEventId 供日後 update/delete
export async function insertGoogleEvent(
  userId: string,
  ev: EventInput
): Promise<WriteResult> {
  const t = await getValidAccessToken(userId);
  if (!t.ok) return { ok: false, reason: t.reason };
  const res = await calFetch(t.accessToken, `/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify(toGBody(ev)),
  });
  if (!res.ok) return { ok: false, reason: "api_error" };
  const data = (await res.json()) as { id: string };
  return { ok: true, googleEventId: data.id };
}

export async function updateGoogleEvent(
  userId: string,
  googleEventId: string,
  ev: EventInput
): Promise<WriteResult> {
  const t = await getValidAccessToken(userId);
  if (!t.ok) return { ok: false, reason: t.reason };
  const res = await calFetch(
    t.accessToken,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "PATCH", body: JSON.stringify(toGBody(ev)) }
  );
  if (!res.ok) return { ok: false, reason: "api_error" };
  return { ok: true, googleEventId };
}

export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string
): Promise<{ ok: boolean }> {
  const t = await getValidAccessToken(userId);
  if (!t.ok) return { ok: false };
  const res = await calFetch(
    t.accessToken,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" }
  );
  // 204 = 成功；410 = 已刪除，也當成功
  return { ok: res.ok || res.status === 410 };
}

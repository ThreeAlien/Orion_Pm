"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/server/calendar-actions";
import type { CalEventItem } from "@/lib/data";

// ---- 日期 <-> input 字串 ----
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDateTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${toDateInput(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowPlus(hours: number): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hours);
  return d;
}

function EventDialog({
  event,
  open,
  onClose,
}: {
  event?: CalEventItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isEdit = !!event;

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(""); // datetime-local 或 date
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setAllDay(event.allDay);
      setStart(
        event.allDay ? toDateInput(event.startIso) : toDateTimeInput(event.startIso)
      );
      setEnd(
        event.allDay ? toDateInput(event.endIso) : toDateTimeInput(event.endIso)
      );
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
    } else {
      const s = nowPlus(1);
      const e = nowPlus(2);
      setTitle("");
      setAllDay(false);
      setStart(toDateTimeInput(s.toISOString()));
      setEnd(toDateTimeInput(e.toISOString()));
      setLocation("");
      setDescription("");
    }
    setSaving(false);
    setError(null);
  }, [open, event]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // 切換全天 ↔ 含時間，轉換現有值避免空白
  function toggleAllDay(next: boolean) {
    setAllDay(next);
    if (next) {
      setStart((s) => (s ? s.slice(0, 10) : ""));
      setEnd((e) => (e ? e.slice(0, 10) : ""));
    } else {
      setStart((s) => (s ? `${s.slice(0, 10)}T09:00` : ""));
      setEnd((e) => (e ? `${e.slice(0, 10)}T10:00` : ""));
    }
  }

  function buildIso(): { startIso: string; endIso: string } {
    if (allDay) {
      const startIso = new Date(start + "T00:00:00").toISOString();
      // 全天 end 至少 +1 天（Google end.date 是排他的）
      const endBase = end && end >= start ? end : start;
      const endDate = new Date(endBase + "T00:00:00");
      endDate.setDate(endDate.getDate() + 1);
      return { startIso, endIso: endDate.toISOString() };
    }
    return {
      startIso: new Date(start).toISOString(),
      endIso: new Date(end).toISOString(),
    };
  }

  function handleSave() {
    if (!title.trim() || !start || !end) return;
    setSaving(true);
    setError(null);
    const { startIso, endIso } = buildIso();
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start: startIso,
      end: endIso,
      allDay,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateCalendarEvent({ ...payload, googleEventId: event!.googleEventId })
        : await createCalendarEvent(payload);
      setSaving(false);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete() {
    if (!event) return;
    if (!confirm(`刪除事件「${event.title}」？也會從 Google 行事曆刪除。`)) return;
    setSaving(true);
    startTransition(async () => {
      const res = await deleteCalendarEvent(event.googleEventId);
      setSaving(false);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] w-[440px] max-w-[92vw] max-h-[88dvh] flex flex-col bg-surface rounded-2xl shadow-2xl">
        <div className="px-5 py-3.5 border-b border-rule flex items-center gap-3">
          <h2 className="text-base font-bold tracking-tight">
            {isEdit ? "編輯事件" : "新增事件"}
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green/[.14] text-green font-semibold">
            Google 同步
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-rule-soft hover:bg-rule text-text-dim flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 overflow-auto">
          <Field label="標題" required>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
              placeholder="例：跟設計團隊對齊"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-text-dim cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => toggleAllDay(e.target.checked)}
            />
            整天事件
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="開始">
              <input
                type={allDay ? "date" : "datetime-local"}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
              />
            </Field>
            <Field label="結束">
              <input
                type={allDay ? "date" : "datetime-local"}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
              />
            </Field>
          </div>

          <Field label="地點（選填）">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
            />
          </Field>

          <Field label="說明（選填）">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface resize-none"
            />
          </Field>

          {error && <div className="text-xs text-red">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-rule flex items-center gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-2 rounded-lg bg-red/[.08] hover:bg-red/[.16] border border-red/30 text-red text-sm font-semibold cursor-pointer disabled:opacity-40"
            >
              刪除
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-rule-soft hover:bg-rule rounded-lg font-medium text-sm text-text-dim cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}

// 標題列「＋ 新增事件」
export function NewEventButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-green text-white px-3.5 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer hover:brightness-95"
      >
        ＋ 新增事件
      </button>
      <EventDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// 日期格裡可點的 Google 事件 chip → 點擊編輯
export function EventChip({ event }: { event: CalEventItem }) {
  const [open, setOpen] = useState(false);
  const time = event.allDay
    ? "整天"
    : `${pad(new Date(event.startIso).getHours())}:${pad(
        new Date(event.startIso).getMinutes()
      )}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${event.title}（Google 事件，點擊編輯）`}
        className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] bg-text text-surface hover:opacity-85 cursor-pointer text-left"
      >
        <span className="shrink-0">📅</span>
        <span className="tabular shrink-0 opacity-70">{time}</span>
        <span className="flex-1 truncate font-medium">{event.title}</span>
      </button>
      <EventDialog event={event} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

"use client";

import { useEffect } from "react";

export interface UpcomingTaskItem {
  id: string;
  title: string;
  dueDateIso: string;
}

const STORAGE_KEY = "orion-notified-task-ids";

export function NotificationManager({
  upcoming,
}: {
  upcoming: UpcomingTaskItem[];
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    // 第一次：請求權限
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (Notification.permission !== "granted") return;

    let notified: string[] = [];
    try {
      notified = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      notified = [];
    }

    let changed = false;
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    for (const t of upcoming) {
      if (notified.includes(t.id)) continue;
      const due = new Date(t.dueDateIso).getTime();
      if (due >= now && due <= in24h) {
        try {
          new Notification("Orion: 任務即將截止", {
            body: t.title,
            icon: "/favicon.ico",
            tag: `orion-${t.id}`,
          });
          notified.push(t.id);
          changed = true;
        } catch {
          /* noop */
        }
      }
    }

    if (changed) {
      // 只保留最近 200 筆，避免 localStorage 無限長
      const trimmed = notified.slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  }, [upcoming]);

  return null;
}

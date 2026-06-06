"use client";

// 通知鈴鐺：未讀數字 badge + 下拉清單。每 30 秒輪詢（沿用 RefreshLoop 的 polling 取向）。
// 點某則通知 → 標該卡已讀 + 跳到該卡片（/?task=id，看板會自動開 drawer）。
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markTaskNotificationsRead,
  type ViewNotification,
} from "@/server/actions";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

export function NotificationBell() {
  const [items, setItems] = useState<ViewNotification[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchMyNotifications()
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    return () => clearInterval(id);
  }, [load]);

  // 點外面關閉
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const unread = items.filter((i) => !i.read).length;

  async function openItem(n: ViewNotification) {
    setOpen(false);
    if (n.taskId) {
      await markTaskNotificationsRead(n.taskId);
      router.push(`/?task=${n.taskId}`);
      router.refresh();
    }
    load();
  }

  async function markAll() {
    await markAllNotificationsRead();
    router.refresh();
    load();
  }

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="通知"
        title="通知"
        className="relative w-9 h-9 rounded-[10px] bg-rule-soft hover:bg-[#EAEAEF] flex items-center justify-center cursor-pointer"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-dim"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[11px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[320px] max-w-[90vw] bg-surface rounded-xl shadow-2xl border border-rule overflow-hidden">
          <div className="px-4 py-2.5 border-b border-rule flex items-center">
            <span className="text-sm font-bold">通知</span>
            <div className="flex-1" />
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[12.5px] text-blue hover:underline cursor-pointer"
              >
                全部標為已讀
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-text-faint">
                還沒有通知
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-2.5 border-b border-rule-soft hover:bg-rule-soft cursor-pointer flex gap-2 ${
                    n.read ? "" : "bg-blue/[.04]"
                  }`}
                >
                  {!n.read && (
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue flex-shrink-0" />
                  )}
                  <span className={`flex-1 min-w-0 ${n.read ? "pl-3.5" : ""}`}>
                    <span className="text-[14px] leading-snug block">
                      <b>{n.actorName ?? "有人"}</b> 在「
                      {n.taskTitle ?? "（任務已刪除）"}」提及了你
                    </span>
                    <span className="text-[12.5px] text-text-faint">
                      {timeAgo(n.createdAtIso)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

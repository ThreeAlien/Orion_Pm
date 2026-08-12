"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NewTaskDialog } from "./new-task-dialog";
import { NotificationBell } from "./notification-bell";
import { FileHubButton } from "./file-hub-button";
import { searchEverything, type SearchResult } from "@/server/actions";
import type { ViewProject, ViewUser, ViewTeam } from "@/lib/data";

const EMPTY: SearchResult = { tasks: [], projects: [] };

export function Topbar({
  projects,
  users,
  teams,
  defaultTeamId,
  currentUserId,
  onMobileMenuOpen,
}: {
  projects: ViewProject[];
  users: ViewUser[];
  teams: ViewTeam[];
  defaultTeamId?: string;
  currentUserId?: string;
  onMobileMenuOpen?: () => void;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打字 → debounce 250ms 才打 server action，避免每個字一次查詢
  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const r = await searchEverything(kw);
      setResult(r);
      setCursor(0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // ⌘K / Ctrl+K 聚焦搜尋框（原本只有標籤沒有功能）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 點外面收起結果
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const hits = [...result.projects, ...result.tasks];

  function go(href: string) {
    setOpen(false);
    setQ("");
    setResult(EMPTY);
    router.push(href);
    router.refresh();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[cursor];
      if (hit) go(hit.href);
    }
  }

  return (
    <>
      <div className="bg-surface px-3 sm:px-4 py-2.5 rounded-2xl flex items-center gap-2 sm:gap-3 shadow-soft">
        {onMobileMenuOpen && (
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden w-9 h-9 rounded-[10px] bg-rule-soft flex items-center justify-center text-base cursor-pointer hover:bg-[#EAEAEF] flex-shrink-0"
            title="開啟選單"
            aria-label="開啟選單"
          >
            ☰
          </button>
        )}
        <div
          ref={boxRef}
          className="relative flex-1 min-w-0 sm:max-w-[420px]"
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => q.trim() && setOpen(true)}
            onKeyDown={onKeyDown}
            className="w-full bg-rule-soft border-0 px-3 sm:px-3.5 py-2 rounded-[10px] text-sm focus:outline-none focus:bg-[#EAEAEF]"
            placeholder="搜尋任務 / 專案…"
          />
          {open && q.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 bg-surface rounded-xl shadow-2xl border border-rule overflow-hidden">
              {loading && hits.length === 0 && (
                <div className="px-3.5 py-3 text-sm text-text-faint">
                  搜尋中…
                </div>
              )}
              {!loading && hits.length === 0 && (
                <div className="px-3.5 py-3 text-sm text-text-faint">
                  找不到「{q.trim()}」
                </div>
              )}
              {result.projects.length > 0 && (
                <div className="px-3.5 pt-2 pb-1 text-[12px] font-semibold text-text-faint uppercase tracking-wider">
                  專案
                </div>
              )}
              {result.projects.map((hit, i) => (
                <SearchRow
                  key={hit.id}
                  hit={hit}
                  active={cursor === i}
                  onHover={() => setCursor(i)}
                  onClick={() => go(hit.href)}
                />
              ))}
              {result.tasks.length > 0 && (
                <div className="px-3.5 pt-2 pb-1 text-[12px] font-semibold text-text-faint uppercase tracking-wider">
                  任務
                </div>
              )}
              {result.tasks.map((hit, i) => {
                const idx = result.projects.length + i;
                return (
                  <SearchRow
                    key={hit.id}
                    hit={hit}
                    active={cursor === idx}
                    onHover={() => setCursor(idx)}
                    onClick={() => go(hit.href)}
                  />
                );
              })}
            </div>
          )}
        </div>
        <span className="hidden sm:inline-flex text-[12.5px] text-text-faint bg-surface-3 px-1.5 py-0.5 rounded-md">
          ⌘ K
        </span>
        <div className="hidden md:block flex-1" />
        <FileHubButton />
        <NotificationBell />
        <button
          onClick={() => setDialogOpen(true)}
          className="bg-blue text-white px-2.5 sm:px-3.5 py-2 rounded-[10px] font-semibold text-[14px] cursor-pointer hover:brightness-95 whitespace-nowrap flex-shrink-0"
        >
          <span className="sm:hidden">＋</span>
          <span className="hidden sm:inline">＋ 新任務</span>
        </button>
      </div>
      <NewTaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projects={projects}
        users={users}
        teams={teams}
        defaultTeamId={defaultTeamId}
        defaultAssigneeId={currentUserId}
      />
    </>
  );
}

function SearchRow({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: { title: string; sub: string | null };
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={`w-full text-left px-3.5 py-2 flex items-center gap-2 cursor-pointer ${
        active ? "bg-blue/[.1]" : "hover:bg-rule-soft"
      }`}
    >
      <span className="flex-1 min-w-0 truncate text-sm">{hit.title}</span>
      {hit.sub && (
        <span className="text-[12.5px] text-text-faint shrink-0 max-w-[40%] truncate">
          {hit.sub}
        </span>
      )}
    </button>
  );
}

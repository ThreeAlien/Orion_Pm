"use client";

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setTeamScope, updateTeam } from "@/server/actions";
import {
  resolveProjectColor,
  NAMED_PROJECT_COLORS,
  type ViewTeam,
} from "@/lib/data";

// 全域團隊範圍切換器。放 sidebar 頂部；切換寫 cookie + refresh，所有 view 跟著縮範圍。
// collapsed 時收成色點 + 縮寫，hover tooltip。
export function TeamFilter({
  teams,
  scope,
  collapsed,
}: {
  teams: ViewTeam[];
  scope: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingTeam, setEditingTeam] = useState<ViewTeam | null>(null);

  function pick(slug: string) {
    if (slug === scope) return;
    startTransition(async () => {
      await setTeamScope(slug);
      // 切團隊後自動回儀表板（避免停在某團隊沒有的專案/頁面看到空畫面）
      router.push("/");
      router.refresh();
    });
  }

  const options = [{ slug: "all", name: "全部", color: "blue" as const }, ...teams];

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 mb-3">
        {options.map((o) => {
          const active = o.slug === scope;
          return (
            <button
              key={o.slug}
              type="button"
              onClick={() => pick(o.slug)}
              disabled={pending}
              title={o.name}
              className={`w-9 h-7 rounded-md flex items-center justify-center text-[12.5px] font-semibold cursor-pointer transition-colors ${
                active
                  ? "bg-blue/[.14] text-blue"
                  : "text-text-faint hover:text-text hover:bg-rule-soft"
              }`}
            >
              {o.slug === "all" ? "全" : o.name.charAt(0)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-3 px-1">
      <div className="px-1.5 pb-1 text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
        團隊
      </div>
      <div className="flex flex-col gap-0.5">
        {options.map((o) => {
          const active = o.slug === scope;
          const dot =
            o.slug === "all" ? null : resolveProjectColor((o as ViewTeam).color);
          return (
            <div key={o.slug} className="group flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => pick(o.slug)}
                disabled={pending}
                className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[14px] font-medium cursor-pointer transition-colors text-left ${
                  active
                    ? "bg-blue/[.12] text-blue"
                    : "text-text-dim hover:text-text hover:bg-rule-soft"
                }`}
              >
                {dot ? (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: dot }}
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gradient-to-br from-orange to-pink" />
                )}
                <span className="flex-1 truncate">{o.name}</span>
                {active && <span className="text-blue text-xs">✓</span>}
              </button>
              {o.slug !== "all" && (
                <button
                  type="button"
                  onClick={() => setEditingTeam(o as ViewTeam)}
                  title="編輯團隊（改名 / 換色）"
                  className="w-6 h-6 shrink-0 rounded-md text-text-faint hover:text-blue hover:bg-rule-soft flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 cursor-pointer text-[12.5px]"
                >
                  ✏
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editingTeam && (
        <TeamEditDialog
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
        />
      )}
    </div>
  );
}

// 團隊改名 / 換色 dialog
function TeamEditDialog({
  team,
  onClose,
}: {
  team: ViewTeam;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState<string>(team.color);
  const [saving, setSaving] = useState(false);
  // portal 到 body：dialog 是 fixed，但 sidebar <aside> 有 transform 會綁架 fixed 定位 → 跑版
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const swatches: { token: string; hex: string }[] = [
    { token: "red", hex: NAMED_PROJECT_COLORS.red },
    { token: "orange", hex: NAMED_PROJECT_COLORS.orange },
    { token: "yellow", hex: NAMED_PROJECT_COLORS.yellow },
    { token: "green", hex: NAMED_PROJECT_COLORS.green },
    { token: "teal", hex: NAMED_PROJECT_COLORS.teal },
    { token: "blue", hex: NAMED_PROJECT_COLORS.blue },
    { token: "purple", hex: NAMED_PROJECT_COLORS.purple },
    { token: "pink", hex: NAMED_PROJECT_COLORS.pink },
  ];

  function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    startTransition(async () => {
      await updateTeam({ id: team.id, name: name.trim(), color });
      setSaving(false);
      onClose();
      router.refresh();
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] w-[360px] max-w-[92vw] bg-surface rounded-2xl shadow-2xl">
        <div className="px-5 py-3.5 border-b border-rule flex items-center gap-3">
          <h2 className="text-base font-bold tracking-tight">編輯團隊</h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-rule-soft hover:bg-rule text-text-dim flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
              團隊名稱
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
            />
          </label>
          <div>
            <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
              顏色
            </div>
            <div className="flex gap-2 flex-wrap">
              {swatches.map((s) => (
                <button
                  key={s.token}
                  type="button"
                  onClick={() => setColor(s.token)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs transition-transform ${
                    color === s.token
                      ? "ring-2 ring-text ring-offset-2 ring-offset-surface scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{ background: s.hex }}
                  title={s.token}
                >
                  {color === s.token ? "✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-rule flex justify-end gap-2">
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
            disabled={saving || !name.trim()}
            className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

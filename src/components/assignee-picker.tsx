"use client";

// 負責人多選：已選的人顯示成可移除 chips；「＋ 加負責人」展開可搜尋的成員清單。
// 人多也不亂（清單收在展開區、預設只看到被指派的）。任務 dialog + 新任務共用。
import { useState, useRef, useEffect } from "react";
import { resolveProjectColor, type ViewUser } from "@/lib/data";

const GRAD: Record<ViewUser["gradient"], string> = {
  w: "from-blue to-purple",
  l: "from-green to-teal",
  s: "from-pink to-orange",
  y: "from-purple to-pink",
};

function Dot({ user, size }: { user: ViewUser; size: number }) {
  const custom = user.avatarColor;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full text-white font-bold items-center justify-center ${
        custom ? "" : `bg-gradient-to-br ${GRAD[user.gradient]}`
      }`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        ...(custom ? { background: resolveProjectColor(custom) } : {}),
      }}
    >
      {user.initial}
    </span>
  );
}

export function AssigneePicker({
  users,
  selectedIds,
  onChange,
}: {
  users: ViewUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // 點選人區塊外面 → 自動收起（不用按「完成」）
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = selectedIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is ViewUser => !!u);
  const q = query.trim().toLowerCase();
  const candidates = users.filter(
    (u) =>
      !selectedIds.includes(u.id) && (!q || u.name.toLowerCase().includes(q))
  );

  if (users.length === 0) {
    return <div className="text-sm text-text-faint px-1 py-1.5">尚無成員</div>;
  }

  return (
    <div ref={rootRef} className="space-y-2">
      {/* 已選的人 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {selected.length === 0 && (
          <span className="text-sm text-text-faint">未指派</span>
        )}
        {selected.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full bg-blue/[.1] text-blue text-[13px] font-medium"
          >
            <Dot user={u} size={16} />
            <span className="max-w-[8rem] truncate">{u.name}</span>
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((x) => x !== u.id))}
              className="text-blue/60 hover:text-red cursor-pointer leading-none"
              title="移除"
            >
              ✕
            </button>
          </span>
        ))}
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setQuery("");
            }}
            className="inline-flex items-center px-2.5 py-1 rounded-full border border-dashed border-rule text-[13px] text-text-dim hover:text-blue hover:border-blue cursor-pointer"
          >
            ＋ 加負責人
          </button>
        )}
      </div>

      {/* 展開：搜尋 + 未選成員清單 */}
      {open && (
        <div className="border border-rule rounded-lg overflow-hidden bg-surface-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋成員…"
            className="w-full bg-transparent border-0 border-b border-rule px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto">
            {candidates.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-faint text-center">
                {q ? "找不到符合的成員" : "成員都加完了"}
              </div>
            ) : (
              candidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onChange([...selectedIds, u.id]);
                    setQuery("");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-rule-soft cursor-pointer"
                >
                  <Dot user={u} size={20} />
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="text-[12.5px] text-blue">＋</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

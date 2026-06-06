"use client";

// 側邊欄收合時的即時 tooltip：hover icon 立刻在右側顯示功能名稱。
// 用 fixed 定位（依 hover 元素的位置算），避免被側邊欄的 overflow 捲動區裁切；
// 原生 title 有 ~1 秒延遲、不夠直覺，這個一移過去就出現。
import { useState, useRef, type ReactNode } from "react";

export function SidebarTip({
  label,
  enabled = true,
  children,
}: {
  label: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!enabled) return <>{children}</>;

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 8 });
  }

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onClick={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          className="fixed z-[100] -translate-y-1/2 px-2 py-1 rounded-md bg-text text-surface text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

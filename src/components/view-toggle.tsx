// 共用的 Dashboard / Gantt / Calendar / List view toggle，依 pathname 自動 active
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const views = [
  { id: "kanban", icon: "▦", label: "看板", href: "/" },
  { id: "gantt", icon: "⊟", label: "甘特圖", href: "/gantt" },
  { id: "calendar", icon: "▤", label: "行事曆", href: "/calendar" },
  { id: "list", icon: "≡", label: "列表", href: "/tasks" },
];

export function ViewToggle() {
  const pathname = usePathname();
  return (
    <div className="inline-flex bg-rule-soft p-[3px] rounded-[10px] gap-0.5">
      {views.map((v) => {
        const active = pathname === v.href;
        return (
          <Link
            key={v.id}
            href={v.href}
            className={`px-3 py-1.5 rounded-[7px] text-[13px] font-medium inline-flex items-center gap-1.5 ${
              active
                ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-text-dim hover:text-text"
            }`}
          >
            <span className="text-[13px]">{v.icon}</span>
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}

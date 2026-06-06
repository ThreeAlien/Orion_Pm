"use client";

// 行事曆專案篩選 chip：點了改 ?project=<id>（保留 view/m/d/w 等其他 query）。
// server 端依此 param 過濾任務，讓畫面任務太多時能聚焦單一專案。
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { resolveProjectColor } from "@/lib/data";
import type { ProjectColor } from "@/lib/data";

export type CalFilterProject = {
  id: string;
  name: string;
  color: ProjectColor | null;
};

export function CalendarProjectFilter({
  projects,
  active,
  people = [],
  activeAssignee,
}: {
  projects: CalFilterProject[];
  active?: string;
  people?: { id: string; name: string }[];
  activeAssignee?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (projects.length === 0 && people.length === 0) return null;

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3">
      {projects.length > 0 && (
        <>
          <Chip active={!active} onClick={() => setParam("project", null)}>
            全部專案
          </Chip>
          {projects.map((p) => (
            <Chip
              key={p.id}
              active={active === p.id}
              dotColor={p.color}
              onClick={() => setParam("project", p.id)}
            >
              {p.name}
            </Chip>
          ))}
        </>
      )}
      {people.length > 0 && (
        <select
          value={activeAssignee ?? ""}
          onChange={(e) => setParam("assignee", e.target.value || null)}
          className="ml-1 bg-rule-soft border-0 rounded-full px-3 py-[5px] text-xs text-text-dim font-medium focus:outline-none cursor-pointer"
        >
          <option value="">所有負責人</option>
          {people.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  dotColor,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  dotColor?: ProjectColor | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-xs font-medium cursor-pointer transition-colors ${
        active
          ? "bg-text text-surface"
          : "bg-rule-soft text-text-dim hover:bg-rule"
      }`}
    >
      {dotColor && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: resolveProjectColor(dotColor) }}
        />
      )}
      {children}
    </button>
  );
}

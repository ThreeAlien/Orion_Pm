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
}: {
  projects: CalFilterProject[];
  active?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (projects.length === 0) return null;

  function go(projectId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3">
      <Chip active={!active} onClick={() => go(null)}>
        全部專案
      </Chip>
      {projects.map((p) => (
        <Chip
          key={p.id}
          active={active === p.id}
          dotColor={p.color}
          onClick={() => go(p.id)}
        >
          {p.name}
        </Chip>
      ))}
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

// Gantt 視圖 — 兩層 hybrid + bar 拖拉改日期 + dependency 連線。
"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { GanttProject, GanttTask } from "@/server/queries";
import type {
  ProjectColor,
  TaskStatus,
  ViewTask,
  ViewProject,
  ViewUser,
} from "@/lib/data";
import { resolveProjectColor } from "@/lib/data";
import { ViewToggle } from "./view-toggle";
import { updateProjectDates, updateTaskDueDate } from "@/server/actions";
import { TaskDrawer } from "./kanban-board";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_ROW_H = 64;
const TASK_ROW_H = 52;

type Mode = "projects" | "tasks";
export type Zoom = "day" | "week" | "month" | "quarter";

const ZOOM_CONFIG: Record<
  Zoom,
  { units: number; daysPerUnit: number; daysBeforeToday: number; label: string }
> = {
  day: { units: 16, daysPerUnit: 1, daysBeforeToday: 3, label: "日" },
  week: { units: 16, daysPerUnit: 7, daysBeforeToday: 21, label: "週" },
  month: { units: 12, daysPerUnit: 30, daysBeforeToday: 60, label: "月" },
  quarter: { units: 8, daysPerUnit: 90, daysBeforeToday: 180, label: "季" },
};

export function GanttView({
  mode,
  zoom = "week",
  projects: initialProjects,
  tasks: initialTasks,
  viewTasks,
  users,
  selectedProjectId,
}: {
  mode: Mode;
  zoom?: Zoom;
  projects: GanttProject[];
  tasks?: GanttTask[];
  viewTasks: ViewTask[];
  users: ViewUser[];
  selectedProjectId?: string;
}) {
  const zoomCfg = ZOOM_CONFIG[zoom];
  const TIMELINE_UNITS = zoomCfg.units;
  const TIMELINE_DAYS = zoomCfg.units * zoomCfg.daysPerUnit;
  const DAYS_BEFORE_TODAY = zoomCfg.daysBeforeToday;
  const [projects, setProjects] = useState(initialProjects);
  const [tasks, setTasks] = useState(initialTasks ?? []);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ESC 關 drawer
  useEffect(() => {
    if (!selectedTaskId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTaskId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTaskId]);

  const selectedTask = selectedTaskId
    ? viewTasks.find((t) => t.id === selectedTaskId) ?? null
    : null;
  const projectsForDrawer: ViewProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    taskCount: p.totalTasks,
  }));

  // 同步 props
  useEffect(() => setProjects(initialProjects), [initialProjects]);
  useEffect(() => setTasks(initialTasks ?? []), [initialTasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 依 zoom 決定 timeline 邊界：day/week 用固定天數；month/quarter 對齊 calendar 邊界（避免月份漂移）
  let start: Date;
  let end: Date;
  let weeks: { label: string; isToday: boolean; isMonthStart: boolean }[];

  if (zoom === "day" || zoom === "week") {
    start = new Date(today.getTime() - DAYS_BEFORE_TODAY * DAY_MS);
    end = new Date(start.getTime() + TIMELINE_DAYS * DAY_MS);
    weeks = Array.from({ length: TIMELINE_UNITS }, (_, i) => {
      const unitStart = new Date(
        start.getTime() + i * zoomCfg.daysPerUnit * DAY_MS
      );
      const unitEnd = new Date(
        unitStart.getTime() + zoomCfg.daysPerUnit * DAY_MS
      );
      return {
        label: formatUnitLabel(unitStart, zoom, i),
        isToday: today >= unitStart && today < unitEnd,
        isMonthStart: zoom === "week" && unitStart.getDate() <= 7,
      };
    });
  } else if (zoom === "month") {
    // 12 calendar months：今天往前 2 個月起算
    const tm = today.getMonth();
    const ty = today.getFullYear();
    start = new Date(ty, tm - 2, 1);
    end = new Date(ty, tm + 10, 1);
    weeks = Array.from({ length: 12 }, (_, i) => {
      const us = new Date(ty, tm - 2 + i, 1);
      const ue = new Date(ty, tm - 2 + i + 1, 1);
      const m = us.getMonth() + 1;
      const y = us.getFullYear();
      return {
        label: i === 0 || m === 1 ? `${y} ${m}月` : `${m}月`,
        isToday: today >= us && today < ue,
        isMonthStart: false,
      };
    });
  } else {
    // quarter：8 calendar quarters（24 個月），對齊 Q boundary
    const tm = today.getMonth();
    const ty = today.getFullYear();
    const tq = Math.floor(tm / 3);
    const baseM = (tq - 2) * 3;
    start = new Date(ty, baseM, 1);
    end = new Date(ty, baseM + 24, 1);
    weeks = Array.from({ length: 8 }, (_, i) => {
      const us = new Date(ty, baseM + i * 3, 1);
      const ue = new Date(ty, baseM + (i + 1) * 3, 1);
      const m = us.getMonth() + 1;
      const y = us.getFullYear();
      const q = Math.floor((m - 1) / 3) + 1;
      return {
        label: `Q${q} ${y}`,
        isToday: today >= us && today < ue,
        isMonthStart: false,
      };
    });
  }

  const totalMs = end.getTime() - start.getTime();
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - start.getTime()) / totalMs) * 100));

  const todayPct = pct(today);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // ===== 量 timeline 寬度（用來 px → day 轉換）=====
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState(900);
  useEffect(() => {
    if (!timelineRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setTimelineWidthPx(w);
    });
    obs.observe(timelineRef.current);
    return () => obs.disconnect();
  }, []);
  const pxPerDay = timelineWidthPx / TIMELINE_DAYS;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, delta } = e;
    if (!delta.x) return;
    const id = active.id as string;
    const deltaDays = Math.round(delta.x / pxPerDay);
    if (deltaDays === 0) return;

    if (mode === "projects") {
      const p = projects.find((x) => x.id === id);
      if (!p || !p.startDate || !p.endDate) return;
      const newStart = new Date(p.startDate.getTime() + deltaDays * DAY_MS);
      const newEnd = new Date(p.endDate.getTime() + deltaDays * DAY_MS);
      // optimistic
      setProjects((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, startDate: newStart, endDate: newEnd } : x
        )
      );
      startTransition(async () => {
        await updateProjectDates({
          id,
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
        });
        router.refresh();
      });
    } else {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const newDue = new Date(t.dueDate.getTime() + deltaDays * DAY_MS);
      const newStartT = new Date(t.startDate.getTime() + deltaDays * DAY_MS);
      // optimistic
      setTasks((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, dueDate: newDue, startDate: newStartT } : x
        )
      );
      startTransition(async () => {
        await updateTaskDueDate({ id, dueDate: newDue.toISOString() });
        router.refresh();
      });
    }
  }

  const activeProjects = projects.filter((p) => !p.isCompleted);
  const completedProjects = projects.filter((p) => p.isCompleted);

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <Header mode={mode} selectedProject={selectedProject} />
      <Toolbar
        mode={mode}
        zoom={zoom}
        selectedProjectId={selectedProjectId}
        projects={projects}
      />

      <DndContext id="gantt-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-auto min-h-0">
          <div className="grid grid-cols-[240px_minmax(900px,1fr)] min-w-[1100px] relative">
            {/* corner */}
            <div className="px-3.5 py-3 text-[11px] text-text-faint font-bold uppercase tracking-wider border-r border-rule border-b-2 border-b-rule sticky left-0 bg-surface z-20">
              {mode === "projects" ? "專案" : "任務"}
            </div>
            {/* time header */}
            <div
              ref={timelineRef}
              className="grid border-b-2 border-rule"
              style={{ gridTemplateColumns: `repeat(${TIMELINE_UNITS}, 1fr)` }}
            >
              {weeks.map((w, i) => (
                <div
                  key={i}
                  className={`py-2.5 text-[11px] text-center tabular border-r border-rule-soft ${
                    w.isMonthStart ? "border-l-2 border-rule" : ""
                  } ${
                    w.isToday
                      ? "bg-blue/[.06] text-blue font-bold"
                      : "text-text-faint"
                  }`}
                >
                  {w.label}
                </div>
              ))}
            </div>

            {mode === "projects" ? (
              <>
                {activeProjects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    weeks={weeks}
                    todayPct={todayPct}
                    pct={pct}
                    start={start}
                    end={end}
                    units={TIMELINE_UNITS}
                  />
                ))}
                {completedProjects.length > 0 && (
                  <>
                    <div className="px-3.5 py-2.5 text-[11px] text-text-faint font-semibold border-r border-rule border-b border-rule sticky left-0 bg-surface-2 z-10">
                      已完成（{completedProjects.length}）
                    </div>
                    <div
                      className="border-b border-rule bg-surface-2 grid"
                      style={{ gridTemplateColumns: `repeat(${TIMELINE_UNITS}, 1fr)` }}
                    >
                      {weeks.map((_, i) => (
                        <div key={i} className="border-r border-rule-soft" />
                      ))}
                    </div>
                    {completedProjects.map((p) => (
                      <ProjectRow
                        key={p.id}
                        project={p}
                        weeks={weeks}
                        todayPct={todayPct}
                        pct={pct}
                        start={start}
                        end={end}
                        units={TIMELINE_UNITS}
                      />
                    ))}
                  </>
                )}
              </>
            ) : tasks.length === 0 ? (
              <div className="col-span-2 px-6 py-12 text-center text-text-faint text-sm">
                這個專案目前沒有設截止日的任務
              </div>
            ) : (
              <>
                {tasks.map((t, idx) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    rowIdx={idx}
                    weeks={weeks}
                    todayPct={todayPct}
                    pct={pct}
                    start={start}
                    end={end}
                    units={TIMELINE_UNITS}
                    onClickBar={() => setSelectedTaskId(t.id)}
                  />
                ))}
                {/* Dependency lines overlay */}
                <DependencyLines tasks={tasks} pct={pct} start={start} end={end} />
              </>
            )}
          </div>
        </div>
      </DndContext>

      <Hint mode={mode} />

      <TaskDrawer
        task={selectedTask}
        projects={projectsForDrawer}
        users={users}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}

// ==== Header ====

function Header({
  mode,
  selectedProject,
}: {
  mode: Mode;
  selectedProject?: GanttProject;
}) {
  const subtitle =
    mode === "projects"
      ? "專案級時間軸（拖拉 bar 平移日期）"
      : selectedProject
      ? `${selectedProject.name} · ${selectedProject.totalTasks} 個任務（拖拉改截止日）`
      : "未選專案";
  return (
    <div className="flex items-center gap-3.5 mb-4 flex-wrap">
      <h1 className="text-[28px] font-bold tracking-tight">Gantt</h1>
      <span className="text-[13px] text-text-dim">{subtitle}</span>
      <div className="flex-1" />
      <ViewToggle />
    </div>
  );
}

// ==== Toolbar ====

function Toolbar({
  mode,
  zoom,
  selectedProjectId,
  projects,
}: {
  mode: Mode;
  zoom: Zoom;
  selectedProjectId?: string;
  projects: GanttProject[];
}) {
  const firstProjectId = projects.find((p) => !p.isCompleted)?.id ?? projects[0]?.id;
  // 切 zoom 時保留當前 mode + project
  const buildZoomHref = (z: Zoom) => {
    const params = new URLSearchParams();
    if (mode === "tasks") {
      params.set("level", "tasks");
      if (selectedProjectId) params.set("project", selectedProjectId);
    }
    if (z !== "week") params.set("zoom", z);
    const qs = params.toString();
    return `/gantt${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="flex items-center gap-3 pb-3.5 mb-0 border-b border-rule flex-wrap">
      <div className="inline-flex p-[3px] bg-rule-soft rounded-[10px] gap-0.5">
        <Link
          href={zoom !== "week" ? `/gantt?zoom=${zoom}` : "/gantt"}
          className={`px-3.5 py-1.5 rounded-[7px] text-[13px] font-semibold cursor-pointer ${
            mode === "projects"
              ? "bg-text text-surface"
              : "text-text-dim hover:text-text"
          }`}
        >
          專案級
        </Link>
        <Link
          href={`/gantt?level=tasks${firstProjectId ? `&project=${firstProjectId}` : ""}${zoom !== "week" ? `&zoom=${zoom}` : ""}`}
          className={`px-3.5 py-1.5 rounded-[7px] text-[13px] font-semibold cursor-pointer ${
            mode === "tasks"
              ? "bg-text text-surface"
              : "text-text-dim hover:text-text"
          }`}
        >
          任務級
        </Link>
      </div>

      {/* Zoom toggle */}
      <div className="inline-flex p-[3px] bg-rule-soft rounded-[10px] gap-0.5">
        {(["day", "week", "month", "quarter"] as Zoom[]).map((z) => (
          <Link
            key={z}
            href={buildZoomHref(z)}
            className={`px-3 py-1.5 rounded-[7px] text-[12px] font-medium cursor-pointer ${
              zoom === z
                ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-text-dim hover:text-text"
            }`}
          >
            {ZOOM_CONFIG[z].label}
          </Link>
        ))}
      </div>

      {mode === "tasks" && projects.length > 0 && (
        <div className="inline-flex items-center gap-1.5">
          <span className="text-xs text-text-faint">專案</span>
          <div className="inline-flex p-[3px] bg-rule-soft rounded-[10px] gap-0.5 flex-wrap">
            {projects
              .filter((p) => !p.isCompleted)
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/gantt?level=tasks&project=${p.id}`}
                  className={`px-3 py-1 rounded-[7px] text-[12px] font-medium cursor-pointer inline-flex items-center gap-1.5 ${
                    selectedProjectId === p.id
                      ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-text-dim hover:text-text"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: resolveProjectColor(p.color) }}
                  />
                  {p.name}
                </Link>
              ))}
          </div>
        </div>
      )}

      <div className="flex-1" />
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-x-3 gap-y-1 items-center text-xs text-text-dim flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm bg-text-faint" /> 尚未開始
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm bg-orange" /> 進行中
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm bg-purple" /> 等待驗收
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm bg-green" /> 已完成
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm bg-red" /> 擱置
      </span>
      <span className="inline-flex items-center gap-1.5 pl-2 border-l border-rule">
        <DepArrowIcon /> 前置任務
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-[2px] h-3 bg-blue" /> 今日
      </span>
    </div>
  );
}

function DepArrowIcon() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" className="flex-shrink-0">
      <line
        x1="0"
        y1="5"
        x2="14"
        y2="5"
        stroke="var(--orange)"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <path d="M 14 1 L 18 5 L 14 9 z" fill="var(--orange)" />
    </svg>
  );
}

// ==== Project Row ====


function ProjectRow({
  project,
  weeks,
  todayPct,
  pct,
  start,
  end,
  units,
}: {
  project: GanttProject;
  weeks: { isMonthStart: boolean; isToday: boolean }[];
  todayPct: number;
  pct: (d: Date) => number;
  start: Date;
  end: Date;
  units: number;
}) {
  const dot = resolveProjectColor(project.color);
  const completed = project.isCompleted;

  const hasBar =
    !!(project.startDate &&
      project.endDate &&
      !(project.endDate < start) &&
      !(project.startDate > end));

  let barLeft = 0;
  let barWidth = 0;
  if (hasBar && project.startDate && project.endDate) {
    barLeft = pct(project.startDate);
    barWidth = pct(project.endDate) - barLeft;
  }

  const barClass = completed
    ? "bg-text-faint/20 border border-text-faint/50"
    : project.completionRate >= 70
    ? "bg-green/20 border border-green/40"
    : project.completionRate >= 40
    ? "bg-orange/25 border border-orange/40"
    : "bg-red/20 border border-red/40";

  const fillClass = completed
    ? "bg-text-faint/80"
    : project.completionRate >= 70
    ? "bg-green"
    : project.completionRate >= 40
    ? "bg-orange"
    : "bg-red";

  return (
    <>
      <Link
        href={`/gantt?level=tasks&project=${project.id}`}
        className={`px-3.5 py-3.5 border-r border-rule border-b border-rule sticky left-0 z-10 cursor-pointer hover:bg-rule-soft transition-colors ${
          completed ? "bg-surface-2" : "bg-surface"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-md inline-block flex-shrink-0"
            style={{ background: dot }}
          />
          <span className={`font-semibold text-sm ${completed ? "text-text-dim" : ""}`}>
            {project.name}
          </span>
          <span className="ml-auto text-[10px] text-text-faint">→ 任務級</span>
        </div>
        <div className="flex gap-2 text-[11px] text-text-dim mt-1.5 pl-[22px] tabular">
          {completed ? (
            <span className="text-green font-semibold">✓ 已完成</span>
          ) : (
            <>
              <span>
                <b className="text-text">{project.completionRate}%</b> ·{" "}
                {project.completedTasks}/{project.totalTasks}
              </span>
              {project.startDate && project.endDate && (
                <span>
                  {fmt(project.startDate)} → {fmt(project.endDate)}
                </span>
              )}
            </>
          )}
        </div>
      </Link>

      <div
        className="relative border-b border-rule grid items-center"
        style={{
          gridTemplateColumns: `repeat(${units}, 1fr)`,
          minHeight: PROJECT_ROW_H,
        }}
      >
        {weeks.map((w, i) => (
          <div
            key={i}
            className={`h-full border-r border-rule-soft ${
              w.isMonthStart ? "border-l-2 border-rule" : ""
            } ${w.isToday ? "bg-blue/[.04]" : ""}`}
          />
        ))}

        {hasBar && !completed ? (
          <DraggableBar
            id={project.id}
            left={barLeft}
            width={barWidth}
            className={`h-7 ${barClass}`}
            fill={
              <div
                className={`absolute left-0 top-0 bottom-0 ${fillClass} opacity-80`}
                style={{ width: `${project.completionRate}%` }}
              />
            }
            label={
              <>
                <span>{project.name}</span>
                <span className="opacity-90 tabular text-[11px]">{project.completionRate}%</span>
              </>
            }
            title={`${project.name} · ${project.completionRate}% · 拖拉平移日期`}
          />
        ) : hasBar && completed ? (
          <StaticBar
            left={barLeft}
            width={barWidth}
            className={`h-7 ${barClass}`}
            fill={
              <div
                className={`absolute left-0 top-0 bottom-0 ${fillClass} opacity-80`}
                style={{ width: `${project.completionRate}%` }}
              />
            }
            label={
              <>
                <span>{project.name}</span>
                <span className="opacity-90 tabular text-[11px]">{project.completionRate}%</span>
              </>
            }
            title={`${project.name} · 已完成`}
          />
        ) : (
          <div className="absolute left-3 text-[11px] text-text-faint top-1/2 -translate-y-1/2">
            {project.endDate && project.endDate < start
              ? `${fmt(project.endDate)} 已結案 · 不在此期間`
              : project.startDate && project.startDate > end
              ? `${fmt(project.startDate)} 開始`
              : "尚未排定"}
          </div>
        )}

        <div
          className="absolute top-0 bottom-0 w-[2px] bg-blue z-10 pointer-events-none"
          style={{ left: `${todayPct}%` }}
        />
      </div>
    </>
  );
}

// ==== Task Row ====

const statusDotColor: Record<TaskStatus, string> = {
  TODO: "var(--text-faint)",
  DISCUSSING: "var(--yellow)",
  ON_HOLD: "var(--red)",
  IN_PROGRESS: "var(--orange)",
  WAITING_REVIEW: "var(--purple)",
  DONE: "var(--green)",
};

const statusLabel: Record<TaskStatus, string> = {
  TODO: "尚未開始",
  DISCUSSING: "待討論",
  ON_HOLD: "擱置",
  IN_PROGRESS: "進行中",
  WAITING_REVIEW: "等待驗收",
  DONE: "已完成",
};

const statusColorMap: Record<TaskStatus, { bar: string; fill: string }> = {
  TODO: { bar: "bg-text-faint/15 border border-text-faint/40", fill: "bg-text-faint/70" },
  DISCUSSING: { bar: "bg-yellow/20 border border-yellow/40", fill: "bg-yellow" },
  ON_HOLD: { bar: "bg-red/15 border border-red/40", fill: "bg-red/60" },
  IN_PROGRESS: { bar: "bg-orange/20 border border-orange/40", fill: "bg-orange" },
  WAITING_REVIEW: { bar: "bg-purple/20 border border-purple/40", fill: "bg-purple" },
  DONE: { bar: "bg-green/20 border border-green/40", fill: "bg-green" },
};

function TaskRow({
  task,
  weeks,
  todayPct,
  pct,
  start,
  end,
  units,
  onClickBar,
}: {
  task: GanttTask;
  rowIdx: number;
  weeks: { isMonthStart: boolean; isToday: boolean }[];
  todayPct: number;
  pct: (d: Date) => number;
  start: Date;
  end: Date;
  units: number;
  onClickBar?: () => void;
}) {
  const hasBar = !(task.dueDate < start) && !(task.startDate > end);
  let barLeft = hasBar ? pct(task.startDate) : 0;
  let barWidth = hasBar ? pct(task.dueDate) - barLeft : 0;
  if (barWidth < 1.2) barWidth = 1.2;

  const colors = statusColorMap[task.status];

  return (
    <>
      <div className="px-3.5 py-3 border-r border-rule border-b border-rule sticky left-0 bg-surface z-10">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ background: statusDotColor[task.status] }}
            title={statusLabel[task.status]}
          />
          <span className="font-medium text-[13px] truncate">{task.title}</span>
        </div>
        <div className="flex gap-2 text-[11px] text-text-dim mt-1 pl-5 tabular">
          {task.assigneeName && <span>{task.assigneeName}</span>}
          <span>· {fmt(task.dueDate)} 截止</span>
          {task.blockedByIds.length > 0 && (
            <span className="text-orange font-semibold">⛓ {task.blockedByIds.length}</span>
          )}
        </div>
      </div>

      <div
        className="relative border-b border-rule grid items-center"
        style={{
          gridTemplateColumns: `repeat(${units}, 1fr)`,
          minHeight: TASK_ROW_H,
        }}
      >
        {weeks.map((w, i) => (
          <div
            key={i}
            className={`h-full border-r border-rule-soft ${
              w.isMonthStart ? "border-l-2 border-rule" : ""
            } ${w.isToday ? "bg-blue/[.04]" : ""}`}
          />
        ))}

        {hasBar && (
          <DraggableBar
            id={task.id}
            left={barLeft}
            width={barWidth}
            className={`h-6 ${colors.bar}`}
            fill={
              <div
                className={`absolute left-0 top-0 bottom-0 ${colors.fill} opacity-90`}
                style={{ width: `${task.completionRate}%` }}
              />
            }
            label={<span>{task.title}</span>}
            title={`${task.title} · 點擊編輯 · 拖拉改日期`}
            small
            onClickBar={onClickBar}
          />
        )}

        <div
          className="absolute top-0 bottom-0 w-[2px] bg-blue z-10 pointer-events-none"
          style={{ left: `${todayPct}%` }}
        />
      </div>
    </>
  );
}

// ==== DraggableBar ====

function DraggableBar({
  id,
  left,
  width,
  className,
  fill,
  label,
  title,
  small,
  onClickBar,
}: {
  id: string;
  left: number;
  width: number;
  className: string;
  fill: React.ReactNode;
  label: React.ReactNode;
  title: string;
  small?: boolean;
  onClickBar?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });

  const dragStyle: React.CSSProperties = transform
    ? { transform: CSS.Translate.toString({ x: transform.x, y: 0, scaleX: 1, scaleY: 1 }) }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // dnd-kit 在 distance < 6 時不會啟動 drag，這時 click 會 fire
        if (!isDragging && onClickBar) onClickBar();
      }}
      className={`absolute rounded-${small ? "md" : "lg"} overflow-hidden flex items-center px-${small ? "2" : "2.5"} cursor-grab active:cursor-grabbing transition-shadow ${className} ${
        isDragging ? "opacity-80 z-30" : ""
      }`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        boxShadow: isDragging
          ? "0 8px 24px rgba(0,0,0,0.18)"
          : "var(--shadow-card)",
        ...dragStyle,
      }}
      title={title}
    >
      {fill}
      <div
        className={`relative flex items-center gap-1.5 ${
          small ? "text-[11px]" : "text-xs"
        } font-${small ? "semibold" : "bold"} text-white truncate`}
      >
        {label}
      </div>
    </div>
  );
}

function StaticBar({
  left,
  width,
  className,
  fill,
  label,
  title,
}: {
  left: number;
  width: number;
  className: string;
  fill: React.ReactNode;
  label: React.ReactNode;
  title: string;
}) {
  return (
    <div
      className={`absolute rounded-lg overflow-hidden flex items-center px-2.5 ${className}`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        boxShadow: "var(--shadow-card)",
      }}
      title={title}
    >
      {fill}
      <div className="relative flex items-center gap-1.5 text-xs font-bold text-white truncate">
        {label}
      </div>
    </div>
  );
}

// ==== Dependency Lines (SVG absolute overlay)====
// 放在 grid container 內（grid 已加 relative），用 absolute position 對齊 timeline area
// timeline area = grid col 2，從 sidebar 240px 起，header 約 44px 高，下方接 task rows 各 52px

const HEADER_HEIGHT = 44;
const SIDEBAR_WIDTH = 240;

function DependencyLines({
  tasks,
  pct,
}: {
  tasks: GanttTask[];
  pct: (d: Date) => number;
  start: Date;
  end: Date;
}) {
  const idxMap = new Map(tasks.map((t, i) => [t.id, i]));

  type Line = {
    blockerIdx: number;
    blockedIdx: number;
    x1: number; // 0~100
    x2: number; // 0~100
  };
  const lines: Line[] = [];
  for (const blocked of tasks) {
    const blockedIdx = idxMap.get(blocked.id)!;
    for (const blockerId of blocked.blockedByIds) {
      const blockerIdx = idxMap.get(blockerId);
      if (blockerIdx === undefined) continue;
      const blocker = tasks[blockerIdx];
      lines.push({
        blockerIdx,
        blockedIdx,
        x1: pct(blocker.dueDate),
        x2: pct(blocked.startDate),
      });
    }
  }

  if (lines.length === 0) return null;

  const totalHeight = tasks.length * TASK_ROW_H;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: SIDEBAR_WIDTH,
        top: HEADER_HEIGHT,
        right: 0,
        height: totalHeight,
        zIndex: 5,
      }}
      viewBox={`0 0 1000 ${totalHeight}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="orion-gantt-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--orange)" />
        </marker>
      </defs>
      {lines.map((l, i) => {
        const y1 = l.blockerIdx * TASK_ROW_H + TASK_ROW_H / 2;
        const y2 = l.blockedIdx * TASK_ROW_H + TASK_ROW_H / 2;
        const startX = l.x1 * 10; // pct → 0~1000
        const endX = l.x2 * 10;
        const midX = Math.max(startX + 8, endX - 12);
        const path = `M ${startX} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${endX - 1} ${y2}`;
        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke="var(--orange)"
            strokeWidth="1.6"
            strokeDasharray="4 3"
            markerEnd="url(#orion-gantt-arrow)"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

// ==== Hint ====

function Hint({ mode }: { mode: Mode }) {
  return (
    <div className="mt-4 px-3.5 py-2.5 rounded-lg text-xs text-text-dim flex items-center gap-2 border-l-[3px] border-blue bg-gradient-to-r from-blue/5 to-purple/5">
      💡{" "}
      {mode === "projects" ? (
        <>
          <b className="text-text">操作：</b>點左側專案名稱切到任務級 · <b className="text-blue">滑鼠拖拉 bar</b> 左右移動可改開始 / 截止日。
        </>
      ) : (
        <>
          <b className="text-text">操作：</b><b className="text-blue">點 bar</b> 編輯任務 · <b className="text-blue">拖拉 bar</b> 改截止日 · <b className="text-orange">橘色虛線箭頭</b> 表示前置任務（箭頭起點要先完成，箭頭指向的任務才能開始）。bar 顏色 = 任務狀態（看上方圖例）。
        </>
      )}
    </div>
  );
}

function fmt(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatUnitLabel(unitStart: Date, zoom: Zoom, idx: number): string {
  const m = unitStart.getMonth() + 1;
  const d = unitStart.getDate();
  const y = unitStart.getFullYear();
  switch (zoom) {
    case "day":
      return `${m}/${d}`;
    case "week": {
      const weekNum = Math.ceil(d / 7);
      return d <= 7 ? `${m}月 W${weekNum}` : `W${weekNum}`;
    }
    case "month": {
      // 1 月或起始位置顯示年份
      return idx === 0 || m === 1 ? `${y} ${m}月` : `${m}月`;
    }
    case "quarter": {
      const q = Math.ceil(m / 3);
      return `Q${q} ${y}`;
    }
  }
}

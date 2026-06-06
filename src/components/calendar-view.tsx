// Calendar 月 / 週視圖 — Phase 2.3 + Google Calendar 事件疊加
import Link from "next/link";
import type { CalendarTask } from "@/server/queries";
import type { TaskStatus, CalEventItem, GoogleCalStatus } from "@/lib/data";
import { resolveProjectColor } from "@/lib/data";
import { ViewToggle } from "./view-toggle";
import { NewEventButton, EventChip } from "./calendar-events";
import {
  CalendarProjectFilter,
  type CalFilterProject,
} from "./calendar-project-filter";

// Google 事件依「開始日」分組（key = 本地日期）
function eventsByDate(events: CalEventItem[]): Map<string, CalEventItem[]> {
  const map = new Map<string, CalEventItem[]>();
  for (const e of events) {
    const d = new Date(e.startIso);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return map;
}
function dayEventKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const statusEmoji: Record<TaskStatus, string> = {
  TODO: "○",
  DISCUSSING: "◐",
  ON_HOLD: "⏸",
  IN_PROGRESS: "◐",
  WAITING_REVIEW: "◑",
  DONE: "✓",
};

type Mode = "month" | "week";

export function CalendarView({
  mode,
  year,
  month,
  weekStart,
  tasks,
  events,
  googleStatus,
  filterProjects = [],
  activeProject,
  filterPeople = [],
  activeAssignee,
}: {
  mode: Mode;
  year: number;
  month: number;
  weekStart?: Date;
  tasks: CalendarTask[];
  events: CalEventItem[];
  googleStatus: GoogleCalStatus;
  filterProjects?: CalFilterProject[];
  activeProject?: string;
  filterPeople?: { id: string; name: string }[];
  activeAssignee?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const evByDate = eventsByDate(events);

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <Header
        tasksCount={tasks.length}
        eventsCount={events.length}
        googleStatus={googleStatus}
      />
      <CalendarProjectFilter
        projects={filterProjects}
        active={activeProject}
        people={filterPeople}
        activeAssignee={activeAssignee}
      />
      <ModeBar mode={mode} year={year} month={month} weekStart={weekStart} />

      {mode === "month" ? (
        <MonthGrid
          year={year}
          month={month}
          tasks={tasks}
          evByDate={evByDate}
          today={today}
        />
      ) : (
        <WeekGrid
          weekStart={weekStart!}
          tasks={tasks}
          evByDate={evByDate}
          today={today}
        />
      )}
    </div>
  );
}

function Header({
  tasksCount,
  eventsCount,
  googleStatus,
}: {
  tasksCount: number;
  eventsCount: number;
  googleStatus: GoogleCalStatus;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3.5 flex-wrap">
        <h1 className="text-[28px] font-bold tracking-tight">Calendar</h1>
        <span className="text-[14px] text-text-dim tabular">
          {tasksCount} 任務
        </span>
        <span className="text-[14px] text-green tabular">
          📅 {eventsCount} Google 事件
        </span>
        <div className="flex-1" />
        <NewEventButton />
        <ViewToggle />
      </div>
      {googleStatus !== "ok" && (
        <div className="mt-3 bg-orange/[.08] border-l-[3px] border-orange rounded-lg px-4 py-2.5 text-xs text-text-dim">
          {googleStatus === "no_token"
            ? "尚未連結 Google 行事曆 — 用 Google 重新登入後即可顯示與同步事件。"
            : googleStatus === "needs_reauth"
            ? "Google 授權已過期（Testing 模式每 7 天）— 請登出後用 Google 重新登入以恢復同步。"
            : "Google 行事曆讀取失敗，請稍後重整再試。"}
        </div>
      )}
    </div>
  );
}

function ModeBar({
  mode,
  year,
  month,
  weekStart,
}: {
  mode: Mode;
  year: number;
  month: number;
  weekStart?: Date;
}) {
  const prevMonth = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const nextMonth = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };

  const weekPrevDate = weekStart
    ? new Date(weekStart.getTime() - 7 * 86400000)
    : null;
  const weekNextDate = weekStart
    ? new Date(weekStart.getTime() + 7 * 86400000)
    : null;

  return (
    <div className="flex items-center gap-2 pb-3 mb-3 border-b border-rule flex-wrap">
      {mode === "month" ? (
        <>
          <Link
            href={`/calendar?view=month&m=${prevMonth.y}-${String(prevMonth.m + 1).padStart(2, "0")}`}
            className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim cursor-pointer"
          >
            ‹
          </Link>
          <Link
            href={`/calendar?view=month&m=${nextMonth.y}-${String(nextMonth.m + 1).padStart(2, "0")}`}
            className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim cursor-pointer"
          >
            ›
          </Link>
          <h2 className="text-lg font-bold tabular tracking-tight ml-1">
            {year} 年 {month + 1} 月
          </h2>
        </>
      ) : weekStart && weekPrevDate && weekNextDate ? (
        <>
          <Link
            href={`/calendar?view=week&d=${ymd(weekPrevDate)}`}
            className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim cursor-pointer"
          >
            ‹
          </Link>
          <Link
            href={`/calendar?view=week&d=${ymd(weekNextDate)}`}
            className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim cursor-pointer"
          >
            ›
          </Link>
          <h2 className="text-lg font-bold tabular tracking-tight ml-1">
            {weekStart.getFullYear()}/{String(weekStart.getMonth() + 1).padStart(2, "0")}/
            {String(weekStart.getDate()).padStart(2, "0")} 起 7 天
          </h2>
        </>
      ) : null}

      <div className="flex-1" />

      <Link
        href="/calendar"
        className="px-3 py-1.5 bg-rule-soft hover:bg-rule rounded-lg text-xs font-medium text-text-dim cursor-pointer"
      >
        今天
      </Link>

      <div className="inline-flex bg-rule-soft p-[3px] rounded-[10px] gap-0.5">
        <Link
          href="/calendar?view=month"
          className={`px-3 py-1.5 rounded-[7px] text-[13px] font-medium ${
            mode === "month"
              ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-text-dim"
          }`}
        >
          月
        </Link>
        <Link
          href="/calendar?view=week"
          className={`px-3 py-1.5 rounded-[7px] text-[13px] font-medium ${
            mode === "week"
              ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-text-dim"
          }`}
        >
          週
        </Link>
      </div>
    </div>
  );
}

// ==== Month Grid ====

function MonthGrid({
  year,
  month,
  tasks,
  evByDate,
  today,
}: {
  year: number;
  month: number;
  tasks: CalendarTask[];
  evByDate: Map<string, CalEventItem[]>;
  today: Date;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const tasksByDate = groupTasksByDate(tasks);

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startWeekday + 1;
    const date = new Date(year, month, dayNum);
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    return {
      date,
      isCurrentMonth,
      isToday: isSameDate(date, today),
      tasks: tasksByDate.get(dateKey(date)) ?? [],
      events: evByDate.get(dayEventKey(date)) ?? [],
    };
  });

  return (
    <>
      <div className="grid grid-cols-7 mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-xs text-text-faint font-bold text-center py-1 ${
              i === 0 || i === 6 ? "text-orange/70" : ""
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0 auto-rows-[minmax(120px,1fr)]">
        {cells.map((c, i) => (
          <DayCell key={i} cell={c} />
        ))}
      </div>
    </>
  );
}

function DayCell({
  cell,
}: {
  cell: {
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    tasks: CalendarTask[];
    events: CalEventItem[];
  };
}) {
  const evVisible = cell.events.slice(0, 2);
  const taskVisible = cell.tasks.slice(0, 2);
  const hidden =
    cell.events.length - evVisible.length + (cell.tasks.length - taskVisible.length);

  return (
    <div
      className={`rounded-lg p-1.5 border flex flex-col gap-0.5 overflow-hidden ${
        cell.isToday
          ? "bg-blue/[.06] border-blue/30"
          : cell.isCurrentMonth
          ? "bg-surface-2 border-rule"
          : "bg-rule-soft border-transparent"
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span
          className={`text-xs tabular font-semibold w-6 h-6 flex items-center justify-center rounded ${
            cell.isToday
              ? "bg-blue text-white"
              : cell.isCurrentMonth
              ? "text-text"
              : "text-text-faint"
          }`}
        >
          {cell.date.getDate()}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {evVisible.map((e) => (
          <EventChip key={e.googleEventId} event={e} />
        ))}
        {taskVisible.map((t) => (
          <TaskChip key={t.id} task={t} dim={!cell.isCurrentMonth} />
        ))}
        {hidden > 0 && (
          <Link
            href={`/calendar?view=week&d=${ymd(cell.date)}`}
            className="text-[11px] text-text-faint px-1 hover:text-blue hover:underline"
          >
            還有 {hidden} 個…
          </Link>
        )}
      </div>
    </div>
  );
}

// ==== Week Grid ====

function WeekGrid({
  weekStart,
  tasks,
  evByDate,
  today,
}: {
  weekStart: Date;
  tasks: CalendarTask[];
  evByDate: Map<string, CalEventItem[]>;
  today: Date;
}) {
  const tasksByDate = groupTasksByDate(tasks);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * 86400000);
    return {
      date: d,
      isToday: isSameDate(d, today),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      tasks: tasksByDate.get(dateKey(d)) ?? [],
      events: evByDate.get(dayEventKey(d)) ?? [],
    };
  });

  return (
    <div className="grid grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto">
      {days.map((d, i) => (
        <div
          key={i}
          className={`flex flex-col rounded-xl border ${
            d.isToday ? "border-blue bg-blue/[.05]" : "border-rule bg-surface-2"
          }`}
        >
          <div
            className={`px-3 py-2.5 border-b ${
              d.isToday ? "border-blue/30" : "border-rule"
            }`}
          >
            <div
              className={`text-[12.5px] font-bold uppercase tracking-wider ${
                d.isWeekend ? "text-orange/80" : "text-text-faint"
              }`}
            >
              {WEEKDAYS[d.date.getDay()]}
            </div>
            <div
              className={`text-2xl font-bold tabular tracking-tight ${
                d.isToday ? "text-blue" : "text-text"
              }`}
            >
              {d.date.getDate()}
            </div>
            <div className="text-[11px] text-text-faint tabular">
              {d.tasks.length} 任務
              {d.events.length > 0 && (
                <span className="text-green"> · 📅 {d.events.length}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 p-2 overflow-y-auto flex-1">
            {d.events.map((e) => (
              <EventChip key={e.googleEventId} event={e} />
            ))}
            {d.tasks.length === 0 && d.events.length === 0 ? (
              <div className="text-[12.5px] text-text-faint p-2">無</div>
            ) : (
              d.tasks.map((t) => <TaskChip key={t.id} task={t} large />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==== Helpers ====

function TaskChip({
  task,
  dim,
  large,
}: {
  task: CalendarTask;
  dim?: boolean;
  large?: boolean;
}) {
  const isDone = task.status === "DONE";
  const chipStyle: React.CSSProperties = task.projectColor
    ? (() => {
        const hex = resolveProjectColor(task.projectColor);
        return { background: `${hex}24`, color: hex, borderColor: `${hex}4D` };
      })()
    : {};

  return (
    // 點任務卡 → 導到看板開該卡 drawer 做編輯；帶 from=cal 讓關閉時自動回行事曆
    <Link
      href={`/?task=${task.id}&from=cal`}
      className={`block px-1.5 py-0.5 rounded border truncate hover:opacity-80 hover:ring-1 hover:ring-current/30 ${
        !task.projectColor ? "bg-rule text-text-dim border-rule" : ""
      } ${dim ? "opacity-50" : ""} ${
        isDone ? "line-through opacity-70" : ""
      } ${large ? "text-xs leading-snug py-1" : "text-[12px]"}`}
      style={chipStyle}
      title={`${task.title}${task.projectName ? ` · ${task.projectName}` : ""}（點擊編輯）`}
    >
      <span className="mr-1">{statusEmoji[task.status]}</span>
      {task.title}
    </Link>
  );
}

function groupTasksByDate(tasks: CalendarTask[]): Map<string, CalendarTask[]> {
  const map = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    const key = dateKey(t.dueDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Tasks 列表頁 — 預設按 status 分組；點 column header 切到 flat sort 模式
// 點任務 row 開 TaskDrawer 看 / 改完整資訊（與 kanban 共用 drawer）
"use client";

import { useState } from "react";
import {
  type ViewTask,
  type ViewProject,
  type ViewUser,
  type TaskStatus,
  type TaskPriority,
  type ProjectColor,
  kanbanColumns,
  projectChipStyle,
  resolveProjectColor,
  projectCategoryLabel,
} from "@/lib/data";
import { ViewToggle } from "./view-toggle";
import { TaskDrawer } from "./kanban-board";

const priorityMap: Record<TaskPriority, { label: string; color: string }> = {
  LOW: { label: "低", color: "text-text-faint" },
  MEDIUM: { label: "中", color: "text-orange" },
  HIGH: { label: "高", color: "text-red" },
};
const priorityRank: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const statusRank: Record<TaskStatus, number> = {
  TODO: 0,
  DISCUSSING: 1,
  IN_PROGRESS: 2,
  WAITING_REVIEW: 3,
  ON_HOLD: 4,
  DONE: 5,
};

const statusMap: Record<TaskStatus, { label: string; bg: string; dot: string }> = {
  TODO: { label: "尚未開始", bg: "bg-text-faint/[.12]", dot: "bg-text-faint" },
  DISCUSSING: { label: "待討論", bg: "bg-yellow/[.18]", dot: "bg-yellow" },
  ON_HOLD: { label: "擱置", bg: "bg-red/[.12]", dot: "bg-red" },
  IN_PROGRESS: { label: "進行中", bg: "bg-orange/[.13]", dot: "bg-orange" },
  WAITING_REVIEW: { label: "等待驗收", bg: "bg-purple/[.13]", dot: "bg-purple" },
  DONE: { label: "已完成", bg: "bg-green/[.14]", dot: "bg-green" },
};

type SortKey = "project" | "status" | "priority" | "assignee" | "due" | "title";
type SortDir = "asc" | "desc";

export function TasksList({
  tasks: allTasks,
  projects,
  users,
}: {
  tasks: ViewTask[];
  projects: ViewProject[];
  users: ViewUser[];
}) {
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openTask, setOpenTask] = useState<ViewTask | null>(null);
  // 篩選：專案（多選）+ 負責人（單選）。跟儀表板一致
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");

  // 先套篩選，再進分組 / 排序
  const tasks = allTasks.filter((t) => {
    if (
      selectedProjectIds.size > 0 &&
      !(t.projectId && selectedProjectIds.has(t.projectId))
    )
      return false;
    if (
      assigneeFilter &&
      !(
        t.assignees?.some((a) => a.id === assigneeFilter) ??
        t.assignee?.id === assigneeFilter
      )
    )
      return false;
    return true;
  });

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      // 同 column 再點 → toggle dir 或回到 group mode（連點 3 次）
      if (sortDir === "asc") setSortDir("desc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // 排序邏輯（flat list 模式）
  function sortedFlat(): ViewTask[] {
    if (!sortKey) return tasks;
    const sorted = [...tasks].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "project":
          av = a.projectId ? projectMap[a.projectId]?.name ?? "" : "~";
          bv = b.projectId ? projectMap[b.projectId]?.name ?? "" : "~";
          break;
        case "status":
          av = statusRank[a.status];
          bv = statusRank[b.status];
          break;
        case "priority":
          av = priorityRank[a.priority];
          bv = priorityRank[b.priority];
          break;
        case "assignee":
          av = a.assignee?.name ?? "~";
          bv = b.assignee?.name ?? "~";
          break;
        case "due":
          av = a.dueDateIso ?? "9999";
          bv = b.dueDateIso ?? "9999";
          break;
        case "title":
          av = a.title;
          bv = b.title;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <Header
        total={tasks.length}
        sortKey={sortKey}
        onReset={() => setSortKey(null)}
      />

      {(projects.length > 0 || users.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {/* 順序統一儀表板：全部 → 負責人 → 專案 chips */}
          <FilterChip
            active={selectedProjectIds.size === 0}
            onClick={() => setSelectedProjectIds(new Set())}
          >
            全部
          </FilterChip>
          {users.length > 0 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className={`px-2.5 py-[5px] rounded-full text-[14px] font-medium cursor-pointer transition-colors border-0 focus:outline-none ${
                assigneeFilter
                  ? "bg-text text-surface"
                  : "bg-rule-soft text-text hover:bg-[#EAEAEF]"
              }`}
              title="依負責人篩選"
            >
              <option value="">👤 所有負責人</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          {projects.map((p) => (
            <FilterChip
              key={p.id}
              active={selectedProjectIds.has(p.id)}
              dotColor={p.color}
              onClick={() => toggleProject(p.id)}
            >
              {p.name}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto -mx-6 px-6 mt-4">
        <div className="min-w-[900px]">
          {/* Table head — 點 column 切換 sort */}
          <div className="grid grid-cols-[40px_1fr_140px_100px_120px_100px_120px_110px] gap-3 px-3 pb-2 text-[12.5px] text-text-faint font-semibold uppercase tracking-wider border-b border-rule">
            <div>#</div>
            <SortableHead
              label="任務"
              active={sortKey === "title"}
              dir={sortDir}
              onClick={() => clickHeader("title")}
            />
            <SortableHead
              label="專案"
              active={sortKey === "project"}
              dir={sortDir}
              onClick={() => clickHeader("project")}
            />
            <div>品項</div>
            <SortableHead
              label="狀態"
              active={sortKey === "status"}
              dir={sortDir}
              onClick={() => clickHeader("status")}
            />
            <SortableHead
              label="優先級"
              active={sortKey === "priority"}
              dir={sortDir}
              onClick={() => clickHeader("priority")}
            />
            <SortableHead
              label="負責人"
              active={sortKey === "assignee"}
              dir={sortDir}
              onClick={() => clickHeader("assignee")}
            />
            <SortableHead
              label="截止"
              active={sortKey === "due"}
              dir={sortDir}
              onClick={() => clickHeader("due")}
              className="text-right justify-end"
            />
          </div>

          {sortKey === null ? (
            // Group by status mode（預設）
            kanbanColumns.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.status);
              if (colTasks.length === 0) return null;
              return (
                <div key={col.status}>
                  <div className="px-3 pt-4 pb-2 text-[12.5px] font-bold tracking-tight flex items-center gap-2">
                    <span
                      className={`w-[18px] h-[3px] rounded-sm ${statusMap[col.status].dot}`}
                    />
                    <span>{col.label}</span>
                    <span className="text-text-faint tabular font-medium">
                      {colTasks.length}
                    </span>
                  </div>
                  {colTasks.map((t, i) => (
                    <Row
                      key={t.id}
                      task={t}
                      idx={i + 1}
                      projectMap={projectMap}
                      onOpen={() => setOpenTask(t)}
                    />
                  ))}
                </div>
              );
            })
          ) : (
            // Flat sort mode
            <div className="pt-2">
              {sortedFlat().map((t, i) => (
                <Row
                  key={t.id}
                  task={t}
                  idx={i + 1}
                  projectMap={projectMap}
                  onOpen={() => setOpenTask(t)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskDrawer
        task={openTask}
        projects={projects}
        users={users}
        onClose={() => setOpenTask(null)}
      />
    </div>
  );
}

function Header({
  total,
  sortKey,
  onReset,
}: {
  total: number;
  sortKey: SortKey | null;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 mb-2 flex-wrap">
      <h1 className="text-[28px] font-bold tracking-tight">Tasks</h1>
      <span className="text-[14px] text-text-dim tabular">{total} 個任務</span>
      {sortKey && (
        <button
          onClick={onReset}
          className="text-xs px-2 py-1 rounded-md bg-rule-soft hover:bg-rule text-text-dim"
        >
          ↺ 重置（回分組）
        </button>
      )}
      <div className="flex-1" />
      <ViewToggle />
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 cursor-pointer hover:text-text transition-colors ${
        active ? "text-blue" : ""
      } ${className}`}
    >
      <span>{label}</span>
      {active && <span className="text-[11px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function Row({
  task,
  idx,
  projectMap,
  onOpen,
}: {
  task: ViewTask;
  idx: number;
  projectMap: Record<string, ViewProject>;
  onOpen: () => void;
}) {
  const project = task.projectId ? projectMap[task.projectId] : undefined;
  return (
    <div
      onClick={onOpen}
      className="grid grid-cols-[40px_1fr_140px_100px_120px_100px_120px_110px] gap-3 px-3 h-12 items-center text-sm border-b border-rule hover:bg-rule-soft cursor-pointer"
    >
      <div className="text-text-faint tabular text-xs">
        {String(idx).padStart(3, "0")}
      </div>
      <div className="min-w-0">
        <div
          className={`font-semibold truncate ${
            task.status === "DONE" ? "text-text-dim" : ""
          }`}
          title={task.description ?? task.title}
        >
          {task.title}
        </div>
      </div>
      <div>
        {project ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[12.5px] font-semibold"
            style={projectChipStyle(project.color)}
          >
            {project.name}
          </span>
        ) : (
          <span className="text-text-faint text-xs">—</span>
        )}
      </div>
      <div>
        {task.category.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.category.map((c) => (
              <span
                key={c}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[12.5px] font-semibold bg-blue/[.12] text-blue"
              >
                {projectCategoryLabel(c)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${statusMap[task.status].bg}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${statusMap[task.status].dot}`}
          />
          {statusMap[task.status].label}
        </span>
      </div>
      <div className={`text-xs font-semibold ${priorityMap[task.priority].color}`}>
        {priorityMap[task.priority].label}
      </div>
      <div className="flex items-center gap-1.5">
        {task.assignee ? (
          <>
            <Avatar
              gradient={task.assignee.gradient}
              initial={task.assignee.initial}
            />
            <span className="text-xs text-text-dim">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-text-faint text-xs">未指派</span>
        )}
      </div>
      <div className="text-right text-xs tabular text-text-dim">
        {task.due ?? "—"}
      </div>
    </div>
  );
}

function FilterChip({
  children,
  active,
  dotColor,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  dotColor?: ProjectColor;
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

function Avatar({
  gradient,
  initial,
}: {
  gradient: "w" | "l" | "s" | "y";
  initial: string;
}) {
  const map = {
    w: "from-blue to-purple",
    l: "from-green to-teal",
    s: "from-pink to-orange",
    y: "from-purple to-pink",
  };
  return (
    <div
      className={`w-5 h-5 rounded-full bg-gradient-to-br ${map[gradient]} text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

// 看板（DnD 拖拉跨 column）+ Task Drawer (含編輯 form)。Phase 1.4b/c。
"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { updateTaskStatus, updateTask, deleteTask } from "@/server/actions";
import {
  kanbanColumns,
  type ViewTask,
  type ViewProject,
  type ViewUser,
  type ProjectColor,
  type TaskStatus,
  type TaskPriority,
  resolveProjectColor,
  projectChipStyle,
} from "@/lib/data";

const barColorMap = {
  gray: "bg-text-faint",
  orange: "bg-orange",
  purple: "bg-purple",
  green: "bg-green",
  red: "bg-red",
};

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "尚未開始" },
  { value: "IN_PROGRESS", label: "進行中" },
  { value: "WAITING_REVIEW", label: "等待驗收" },
  { value: "DONE", label: "已完成" },
  { value: "ON_HOLD", label: "擱置" },
  { value: "DISCUSSING", label: "待討論" },
];

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "LOW", label: "◾️ 低" },
  { value: "MEDIUM", label: "🔸 中" },
  { value: "HIGH", label: "🔥 高" },
];

export function KanbanBoard({
  tasks: initialTasks,
  projects,
  users,
  currentUserId,
  showFilterRow = false,
}: {
  tasks: ViewTask[];
  projects: ViewProject[];
  users?: ViewUser[];
  currentUserId?: string;
  showFilterRow?: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // 同步 props 變更（router.refresh 後 server 重 query 餵新 props）
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // ESC 關 drawer
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveTaskId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTaskId(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // optimistic
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    startTransition(async () => {
      await updateTaskStatus({ id: taskId, status: newStatus });
      router.refresh();
    });
  }

  const selected = selectedId
    ? tasks.find((t) => t.id === selectedId) ?? null
    : null;
  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId) ?? null
    : null;

  const filteredTasks = tasks
    .filter(
      (t) =>
        selectedProjectIds.size === 0 ||
        (t.projectId && selectedProjectIds.has(t.projectId))
    )
    .filter(
      (t) =>
        !onlyMine ||
        (currentUserId !== undefined && t.assignee?.id === currentUserId)
    );

  function toggleProjectFilter(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearProjectFilter() {
    setSelectedProjectIds(new Set());
  }

  return (
    <>
      {showFilterRow && (
        <FilterRow
          projects={projects}
          totalTasks={tasks.length}
          selectedProjectIds={selectedProjectIds}
          onToggle={toggleProjectFilter}
          onClear={clearProjectFilter}
          onlyMine={onlyMine}
          onToggleOnlyMine={() => setOnlyMine((m) => !m)}
          canFilterMine={!!currentUserId}
        />
      )}
      <DndContext
        id="kanban-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-[repeat(5,minmax(240px,1fr))] gap-3 flex-1 min-h-0 overflow-x-auto pb-1">
          {kanbanColumns.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <KanbanColumn
                key={col.status}
                status={col.status}
                label={col.label}
                bar={col.bar}
                tasks={columnTasks}
                projects={projects}
                onSelect={setSelectedId}
              />
            );
          })}
        </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && (
          <div className="rotate-2 opacity-95">
            <TaskCardInner
              task={activeTask}
              projects={projects}
              isOverlay
            />
          </div>
        )}
      </DragOverlay>

        <TaskDrawer
          task={selected}
          projects={projects}
          users={users ?? []}
          onClose={() => setSelectedId(null)}
        />
      </DndContext>
    </>
  );
}

// ==== FilterRow（client，可點 chip 切換）====

function FilterRow({
  projects,
  totalTasks,
  selectedProjectIds,
  onToggle,
  onClear,
  onlyMine,
  onToggleOnlyMine,
  canFilterMine,
}: {
  projects: ViewProject[];
  totalTasks: number;
  selectedProjectIds: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  onlyMine: boolean;
  onToggleOnlyMine: () => void;
  canFilterMine: boolean;
}) {
  const noFilter = selectedProjectIds.size === 0;
  return (
    <div className="flex gap-2 items-center flex-wrap pb-4 mb-[18px] border-b border-rule">
      <span className="text-xs text-text-faint mr-1">篩選</span>
      <FilterChip active={noFilter} onClick={onClear}>
        全部{" "}
        <span
          className={`text-[11px] tabular ${
            noFilter ? "text-white/60" : "text-text-faint"
          }`}
        >
          {totalTasks}
        </span>
      </FilterChip>
      {canFilterMine && (
        <FilterChip active={onlyMine} onClick={onToggleOnlyMine}>
          👤 只看我的
        </FilterChip>
      )}
      {projects.map((p) => {
        const active = selectedProjectIds.has(p.id);
        return (
          <FilterChip
            key={p.id}
            active={active}
            onClick={() => onToggle(p.id)}
          >
            <FilterDot color={p.color} />
            {p.name}{" "}
            <span
              className={`text-[11px] tabular ${
                active ? "text-white/60" : "text-text-faint"
              }`}
            >
              {p.taskCount}
            </span>
          </FilterChip>
        );
      })}
      {!noFilter && (
        <span className="text-[11px] text-text-faint ml-2 tabular">
          已選 {selectedProjectIds.size} 個專案 · 點專案 chip 取消
        </span>
      )}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[13px] font-medium cursor-pointer transition-colors ${
        active
          ? "bg-text text-surface"
          : "bg-rule-soft text-text hover:bg-[#EAEAEF]"
      }`}
    >
      {children}
    </button>
  );
}

function FilterDot({ color }: { color: ProjectColor }) {
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{ background: resolveProjectColor(color) }}
    />
  );
}

// ==== Droppable Column ====

function KanbanColumn({
  status,
  label,
  bar,
  tasks,
  projects,
  onSelect,
}: {
  status: TaskStatus;
  label: string;
  bar: keyof typeof barColorMap;
  tasks: ViewTask[];
  projects: ViewProject[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`bg-surface-3 rounded-xl flex flex-col min-h-[200px] overflow-hidden transition-colors ${
        isOver ? "ring-2 ring-blue ring-inset bg-blue/[.06]" : ""
      }`}
    >
      <div className="px-3.5 pt-3 pb-2.5 flex items-center gap-2">
        <div className={`w-[18px] h-[3px] rounded-sm ${barColorMap[bar]}`} />
        <span className="text-[13px] font-bold tracking-tight">{label}</span>
        <span className="text-xs text-text-faint tabular font-medium">
          {tasks.length}
        </span>
        <button className="ml-auto w-[22px] h-[22px] rounded-md text-text-faint text-base flex items-center justify-center hover:bg-surface hover:text-text cursor-pointer">
          ＋
        </button>
      </div>
      <div className="flex flex-col gap-2 px-2 pb-3 pt-1 overflow-y-auto flex-1">
        {tasks.length === 0 ? (
          <EmptyColumn />
        ) : (
          tasks.map((t) => (
            <DraggableCard
              key={t.id}
              task={t}
              projects={projects}
              onClick={() => onSelect(t.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EmptyColumn() {
  return (
    <div className="px-3 py-6 text-center text-text-faint text-xs">
      拖拉任務到這欄
    </div>
  );
}

// ==== Draggable Card ====

function DraggableCard({
  task,
  projects,
  onClick,
}: {
  task: ViewTask;
  projects: ViewProject[];
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // 拖拉時 dnd-kit 會 prevent click，此處純為 fallback
        if (!isDragging) onClick();
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
      }}
      className="touch-none"
    >
      <TaskCardInner task={task} projects={projects} />
    </div>
  );
}

function TaskCardInner({
  task,
  projects,
  isOverlay,
}: {
  task: ViewTask;
  projects: ViewProject[];
  isOverlay?: boolean;
}) {
  const project = task.projectId
    ? projects.find((p) => p.id === task.projectId)
    : undefined;
  const isDone = task.status === "DONE";

  return (
    <div
      className={`bg-surface rounded-[10px] p-3 cursor-pointer transition-all ${
        isOverlay ? "shadow-2xl" : "hover:-translate-y-px"
      }`}
      style={{
        boxShadow: isOverlay
          ? "0 12px 32px rgba(0,0,0,0.18)"
          : "var(--shadow-card)",
        opacity: isDone ? 0.85 : 1,
      }}
    >
      <div className="flex gap-1 mb-2 flex-wrap">
        {project && <ProjectTag project={project} />}
        {task.priority === "HIGH" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold bg-red/[.12] text-red">
            🔥 高
          </span>
        )}
        {task.hasDependency && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-orange font-semibold ml-auto">
            ⛓ 依賴
          </span>
        )}
      </div>

      <div
        className={`text-sm font-semibold leading-snug tracking-tight mb-1.5 ${
          isDone ? "text-text-dim" : ""
        }`}
      >
        {task.title}
      </div>

      {task.description && (
        <div className="text-xs text-text-dim leading-relaxed mb-2.5 line-clamp-2">
          {task.description}
        </div>
      )}

      {task.subtasks && (
        <div className="h-1 bg-rule rounded-full mb-2 overflow-hidden">
          <div
            className="h-full bg-orange rounded-full"
            style={{
              width: `${(task.subtasks.done / task.subtasks.total) * 100}%`,
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-text-dim">
        <div className="flex items-center gap-1.5">
          {task.assignee && <MiniAvatar user={task.assignee} />}
          {task.subtasks && (
            <span className="text-[11px] text-text-faint inline-flex items-center gap-0.5">
              ▦ {task.subtasks.done}/{task.subtasks.total}
            </span>
          )}
        </div>
        {task.due && task.duePill && (
          <DuePill kind={task.duePill}>{task.due}</DuePill>
        )}
      </div>
    </div>
  );
}

// ==== Drawer (with edit form) ====
// 也 export 給 Gantt 共用（點 bar 開 drawer）
export function TaskDrawer({
  task,
  projects,
  users,
  onClose,
}: {
  task: ViewTask | null;
  projects: ViewProject[];
  users: ViewUser[];
  onClose: () => void;
}) {
  const open = task !== null;
  const [, startTransition] = useTransition();
  const router = useRouter();

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [projectId, setProjectId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // sync from task
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setProjectId(task.projectId ?? "");
      setAssigneeId(task.assignee?.id ?? "");
      setStartDate(task.startDateIso ? task.startDateIso.slice(0, 10) : "");
      setDueDate(task.dueDateIso ? task.dueDateIso.slice(0, 10) : "");
    }
  }, [task]);

  function handleSave() {
    if (!task) return;
    setSaving(true);
    startTransition(async () => {
      await updateTask({
        id: task.id,
        title,
        description: description || null,
        status,
        priority,
        projectId: projectId || null,
        assigneeId: assigneeId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      setSaving(false);
      router.refresh();
      onClose();
    });
  }

  function handleArchive() {
    if (!task) return;
    if (!confirm(`確定要封存「${task.title}」？（不會真的刪除，可以之後復原）`))
      return;
    startTransition(async () => {
      await deleteTask(task.id);
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/25 backdrop-blur-[2px] transition-opacity duration-200 z-40 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 h-[100dvh] w-full sm:w-[480px] sm:max-w-[92vw] bg-surface shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {task && (
          <>
            <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
              <span className="text-[11px] text-text-faint font-semibold uppercase tracking-wider">
                編輯任務
              </span>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
                title="關閉 (ESC)"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border-0 text-2xl font-bold tracking-tight leading-tight focus:outline-none focus:bg-surface-2 rounded-md px-2 -mx-2 py-1"
                placeholder="任務標題"
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface resize-none"
                placeholder="描述（選填）"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DrawerField label="狀態">
                  <DrawerSelect
                    value={status}
                    onChange={(v) => setStatus(v as TaskStatus)}
                    options={statusOptions}
                  />
                </DrawerField>
                <DrawerField label="優先級">
                  <DrawerSelect
                    value={priority}
                    onChange={(v) => setPriority(v as TaskPriority)}
                    options={priorityOptions}
                  />
                </DrawerField>
                <DrawerField label="專案">
                  <DrawerSelect
                    value={projectId}
                    onChange={setProjectId}
                    options={[
                      { value: "", label: "（無）" },
                      ...projects.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </DrawerField>
                <DrawerField label="負責人">
                  <DrawerSelect
                    value={assigneeId}
                    onChange={setAssigneeId}
                    options={[
                      { value: "", label: "未指派" },
                      ...users.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                </DrawerField>
                <DrawerField label="開始日">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  />
                </DrawerField>
                <DrawerField label="截止日">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  />
                </DrawerField>
                {task.subtasks && (
                  <DrawerField label="子任務">
                    <div className="px-3 py-2 bg-surface-2 rounded-lg text-sm font-semibold tabular">
                      {task.subtasks.done} / {task.subtasks.total}
                    </div>
                  </DrawerField>
                )}
              </div>

              <div className="text-xs text-text-faint pt-3 border-t border-rule">
                💡 拖拉看板卡片直接改狀態，或在這裡編輯後按下方「儲存」。
              </div>
            </div>

            <div className="px-6 py-3 border-t border-rule flex items-center gap-2">
              <button
                onClick={handleArchive}
                className="px-3 py-2 rounded-lg bg-red/[.08] hover:bg-red/[.16] border border-red/30 text-red text-sm font-semibold cursor-pointer"
                title="封存此任務（之後可在封存區還原）"
              >
                封存
              </button>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="px-4 py-2 bg-rule-soft hover:bg-rule rounded-lg font-medium text-sm text-text-dim cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
              >
                {saving ? "儲存中..." : "儲存"}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function DrawerField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}

function DrawerSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface appearance-none pr-8 bg-no-repeat bg-[right_10px_center]"
      style={{
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236E6E73' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,
        backgroundSize: "10px",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ==== Helpers ====

function ProjectTag({ project }: { project: ViewProject }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold"
      style={projectChipStyle(project.color)}
    >
      {project.name}
    </span>
  );
}

function MiniAvatar({ user }: { user: ViewUser }) {
  const map = {
    w: "from-blue to-purple",
    l: "from-green to-teal",
    s: "from-pink to-orange",
    y: "from-purple to-pink",
  };
  return (
    <div
      className={`w-[18px] h-[18px] rounded-full bg-gradient-to-br ${map[user.gradient]} text-white text-[9px] font-bold flex items-center justify-center`}
      title={user.name}
    >
      {user.initial}
    </div>
  );
}

function DuePill({
  kind,
  children,
}: {
  kind: "today" | "warn" | "danger" | "soft";
  children: React.ReactNode;
}) {
  const map = {
    today: "bg-blue/[.12] text-blue",
    warn: "bg-orange/[.13] text-[#C47000]",
    danger: "bg-red/[.12] text-red",
    soft: "bg-rule-soft text-text-dim",
  };
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded-[5px] font-semibold tabular ml-auto ${map[kind]}`}
    >
      {children}
    </span>
  );
}

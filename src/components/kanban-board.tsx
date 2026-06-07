// 看板（DnD 拖拉跨 column）+ Task Drawer (含編輯 form)。Phase 1.4b/c。
"use client";

import {
  useState,
  useEffect,
  useTransition,
  useMemo,
  useContext,
  createContext,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateTaskStatus,
  updateTask,
  deleteTask,
  addComment,
  updateComment,
  deleteComment,
  getTaskTimeline,
  addChecklistItem,
  toggleChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
  getTaskChecklist,
  getTaskLinks,
  getLinkableTasks,
  addTaskLink,
  removeTaskLink,
  getTaskPeek,
  markTaskNotificationsRead,
} from "@/server/actions";
import type { ViewTaskLink, ViewTaskPeek } from "@/server/queries";
import { RichTextEditor, isRichTextEmpty } from "./rich-text-editor";
import { RichTextView, htmlToPlainText } from "./rich-text-view";
import { AssigneePicker } from "./assignee-picker";
import {
  kanbanColumns,
  type ViewTask,
  type ViewProject,
  type ViewUser,
  type ProjectColor,
  type TaskStatus,
  type TaskPriority,
  type ViewTimelineItem,
  type ViewActivity,
  type TimelineAuthor,
  type ViewChecklistItem,
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

// 被 @ 且未讀的 taskId 集合，給卡片標色用（避免穿三層 props）
const MentionedTasksContext = createContext<Set<string>>(new Set());

export function KanbanBoard({
  tasks: initialTasks,
  projects,
  users,
  currentUserId,
  showFilterRow = false,
  unreadMentionTaskIds,
}: {
  tasks: ViewTask[];
  projects: ViewProject[];
  users?: ViewUser[];
  currentUserId?: string;
  showFilterRow?: boolean;
  unreadMentionTaskIds?: string[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 從哪個頁面點進來開卡的（行事曆等）→ 關閉時導回；null = 一般在看板開
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const mentionedSet = useMemo(
    () => new Set(unreadMentionTaskIds ?? []),
    [unreadMentionTaskIds],
  );
  const searchParams = useSearchParams();
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set()
  );
  // 負責人篩選：'' = 全部；否則為某 user id（含自己）。可看任何人的任務，不再只有「我的」
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
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
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  // 從通知 / 行事曆點進來：/?task=<id> 自動開該卡 drawer，開完把 query 清掉避免重整又彈開。
  // from=cal → 記下「關閉後回行事曆」，讓使用者不用手動點回去
  useEffect(() => {
    const tid = searchParams.get("task");
    if (tid) {
      setSelectedId(tid);
      setReturnTo(searchParams.get("from") === "cal" ? "/calendar" : null);
      router.replace("/", { scroll: false });
    }
  }, [searchParams, router]);

  // 關閉 drawer：有來源頁（行事曆）就導回去，否則單純關閉
  function closeDrawer() {
    setSelectedId(null);
    if (returnTo) {
      const dest = returnTo;
      setReturnTo(null);
      router.push(dest);
    }
  }

  // 開到「被 @ 未讀」的卡 → 標已讀（鈴鐺數字 / 卡片標色一起消）
  useEffect(() => {
    if (selectedId && mentionedSet.has(selectedId)) {
      markTaskNotificationsRead(selectedId).then(() => router.refresh());
    }
  }, [selectedId, mentionedSet, router]);

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
        !assigneeFilter ||
        (t.assignees?.some((a) => a.id === assigneeFilter) ??
          t.assignee?.id === assigneeFilter)
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
    <MentionedTasksContext.Provider value={mentionedSet}>
      {showFilterRow && (
        <FilterRow
          projects={projects}
          totalTasks={tasks.length}
          selectedProjectIds={selectedProjectIds}
          onToggle={toggleProjectFilter}
          onClear={clearProjectFilter}
          users={users ?? []}
          assigneeFilter={assigneeFilter}
          onAssigneeChange={setAssigneeFilter}
          currentUserId={currentUserId}
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
          currentUserId={currentUserId}
          onClose={closeDrawer}
          backLabel={returnTo === "/calendar" ? "行事曆" : null}
        />
      </DndContext>
    </MentionedTasksContext.Provider>
  );
}

// ==== FilterRow（client，可點 chip 切換）====

function FilterRow({
  projects,
  totalTasks,
  selectedProjectIds,
  onToggle,
  onClear,
  users,
  assigneeFilter,
  onAssigneeChange,
  currentUserId,
}: {
  projects: ViewProject[];
  totalTasks: number;
  selectedProjectIds: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  users: ViewUser[];
  assigneeFilter: string;
  onAssigneeChange: (id: string) => void;
  currentUserId?: string;
}) {
  const noFilter = selectedProjectIds.size === 0;
  // 把自己排在選單最前面（標「（我）」），其餘成員照名稱
  const me = users.find((u) => u.id === currentUserId);
  const others = users.filter((u) => u.id !== currentUserId);
  return (
    <div className="flex gap-2 items-center flex-wrap pb-4 mb-[18px] border-b border-rule">
      <span className="text-xs text-text-faint mr-1">篩選</span>
      <FilterChip active={noFilter} onClick={onClear}>
        全部{" "}
        <span
          className={`text-[12.5px] tabular ${
            noFilter ? "text-white/60" : "text-text-faint"
          }`}
        >
          {totalTasks}
        </span>
      </FilterChip>
      {users.length > 0 && (
        <select
          value={assigneeFilter}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className={`px-2.5 py-[5px] rounded-full text-[14px] font-medium cursor-pointer transition-colors border-0 focus:outline-none ${
            assigneeFilter
              ? "bg-text text-surface"
              : "bg-rule-soft text-text hover:bg-[#EAEAEF]"
          }`}
          title="依負責人篩選"
        >
          <option value="">👤 所有負責人</option>
          {me && <option value={me.id}>{me.name}（我）</option>}
          {others.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
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
              className={`text-[12.5px] tabular ${
                active ? "text-white/60" : "text-text-faint"
              }`}
            >
              {p.taskCount}
            </span>
          </FilterChip>
        );
      })}
      {!noFilter && (
        <span className="text-[12.5px] text-text-faint ml-2 tabular">
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[14px] font-medium cursor-pointer transition-colors ${
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
        <span className="text-[14px] font-bold tracking-tight">{label}</span>
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

// 起迄日之間的工作日數（含頭尾、扣掉六日；國定連假紅字照算工作日，不扣）
function countWorkingDays(startIso: string, endIso: string): number {
  const s = new Date(startIso);
  s.setHours(0, 0, 0, 0);
  const e = new Date(endIso);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
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
  const router = useRouter();
  const [, startArchive] = useTransition();
  // 被 @ 且未讀：卡片加底色 + 左側色條，一眼看出有人提及你
  const mentioned = useContext(MentionedTasksContext).has(task.id) && !isOverlay;
  // 有起迄日 → 算工作日總時程（不含六日）顯示在右上角
  const workDays =
    task.startDateIso && task.dueDateIso
      ? countWorkingDays(task.startDateIso, task.dueDateIso)
      : null;

  return (
    <div
      className={`group relative rounded-[10px] p-3 cursor-pointer transition-all ${
        isOverlay ? "shadow-2xl" : "hover:-translate-y-px"
      } ${mentioned ? "ring-2 ring-orange bg-orange/[.06]" : "bg-surface"}`}
      style={{
        boxShadow: isOverlay
          ? "0 12px 32px rgba(0,0,0,0.18)"
          : "var(--shadow-card)",
        opacity: isDone ? 0.85 : 1,
      }}
    >
      {!isOverlay && (
        // 右上角：工作日總時程（常駐）+ 封存鈕（hover 才浮現），排同列不打架。
        // 封存鈕 stopPropagation 擋掉開卡(onClick)與 dnd-kit 拖拉(pointerdown)。
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          <button
            type="button"
            title="封存此任務"
            aria-label="封存此任務"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (
                !confirm(
                  `確定要封存「${task.title}」？（不會真的刪除，可以之後復原）`,
                )
              )
                return;
              startArchive(async () => {
                await deleteTask(task.id);
                router.refresh();
              });
            }}
            className="grid place-items-center w-6 h-6 rounded-md text-text-faint opacity-0 group-hover:opacity-100 hover:text-red hover:bg-red/[.10] transition-all"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
          {workDays != null && (
            <span
              title={`工作日總時程 ${workDays} 天（含起迄、不含六日；國定連假照算）`}
              className="px-1.5 py-0.5 rounded-md bg-rule-soft text-text-dim text-[11px] font-semibold tabular whitespace-nowrap"
            >
              {workDays} 工作日
            </span>
          )}
        </div>
      )}

      <div
        className={`flex gap-1 mb-2 flex-wrap ${
          workDays != null ? "pr-[68px]" : "pr-6"
        }`}
      >
        {mentioned && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[12.5px] font-semibold bg-orange/[.15] text-orange">
            @ 提及你
          </span>
        )}
        {project && <ProjectTag project={project} />}
        {task.priority === "HIGH" && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[12.5px] font-semibold bg-red/[.12] text-red">
            🔥 高
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
          {htmlToPlainText(task.description)}
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

      <div className="flex items-center gap-2 text-[12.5px] text-text-dim">
        <div className="flex items-center gap-1.5">
          <AssigneeAvatars task={task} />
          {task.subtasks && (
            <span className="text-[12.5px] text-text-faint inline-flex items-center gap-0.5">
              ▦ {task.subtasks.done}/{task.subtasks.total}
            </span>
          )}
          {task.checklist && (
            <span className="text-[12.5px] text-text-faint inline-flex items-center gap-0.5">
              ☑ {task.checklist.done}/{task.checklist.total}
            </span>
          )}
          {task.commentCount != null && task.commentCount > 0 && (
            <span className="text-[12.5px] text-text-faint inline-flex items-center gap-0.5">
              💬 {task.commentCount}
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
  currentUserId,
  onClose,
  backLabel,
}: {
  task: ViewTask | null;
  projects: ViewProject[];
  users: ViewUser[];
  currentUserId?: string;
  onClose: () => void;
  // 有值時 header 顯示「← {backLabel}」返回鈕（如從行事曆點進來）
  backLabel?: string | null;
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
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // 留言 + 活動軌跡時間軸
  const [timeline, setTimeline] = useState<ViewTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  // sync from task
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setProjectId(task.projectId ?? "");
      setAssigneeIds(
        task.assignees && task.assignees.length > 0
          ? task.assignees.map((a) => a.id)
          : task.assignee
          ? [task.assignee.id]
          : []
      );
      setStartDate(task.startDateIso ? task.startDateIso.slice(0, 10) : "");
      setDueDate(task.dueDateIso ? task.dueDateIso.slice(0, 10) : "");
    }
  }, [task]);

  // 開 drawer / 切換任務時載入時間軸
  useEffect(() => {
    if (!task) {
      setTimeline([]);
      return;
    }
    const taskId = task.id;
    let cancelled = false;
    setTimelineLoading(true);
    setEditingId(null);
    getTaskTimeline(taskId).then((items) => {
      if (!cancelled) {
        setTimeline(items);
        setTimelineLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [task?.id]);

  // P1 即時留言：drawer 開著時每 15 秒撈一次新留言/動態，補上看板 30s polling 不會
  // 更新「已打開卡片」內容的洞。背景分頁、或正在編輯留言時跳過（不打斷、不浪費）。
  useEffect(() => {
    if (!task) return;
    const taskId = task.id;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || editingId) return;
      getTaskTimeline(taskId)
        .then((items) => setTimeline(items))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [task?.id, editingId]);

  async function refetchTimeline() {
    if (!task) return;
    const items = await getTaskTimeline(task.id);
    setTimeline(items);
  }

  function handlePostComment() {
    if (!task || !commentBody.trim() || posting) return;
    setPosting(true);
    startTransition(async () => {
      const res = await addComment({ taskId: task.id, body: commentBody });
      if (res.ok) {
        setCommentBody("");
        await refetchTimeline();
        router.refresh();
      } else {
        alert(res.error);
      }
      setPosting(false);
    });
  }

  function handleSaveEdit() {
    if (!editingId || !editBody.trim()) return;
    const id = editingId;
    startTransition(async () => {
      const res = await updateComment({ id, body: editBody });
      if (res.ok) {
        setEditingId(null);
        await refetchTimeline();
      } else {
        alert(res.error);
      }
    });
  }

  function handleDeleteComment(id: string) {
    if (!confirm("確定刪除這則留言？")) return;
    startTransition(async () => {
      const res = await deleteComment(id);
      if (res.ok) {
        await refetchTimeline();
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  function handleSave() {
    if (!task) return;
    setSaving(true);
    startTransition(async () => {
      await updateTask({
        id: task.id,
        title,
        description: isRichTextEmpty(description) ? null : description,
        status,
        priority,
        projectId: projectId || null,
        assigneeIds,
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
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 ${
        open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-surface rounded-2xl shadow-2xl w-full sm:w-[1040px] max-w-[92vw] max-h-[88dvh] flex flex-col overflow-hidden transition-transform duration-200 ease-out ${
          open ? "scale-100" : "scale-95"
        }`}
      >
        {task && (
          <>
            <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
              {backLabel && (
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rule-soft hover:bg-rule text-[13px] font-medium text-text-dim cursor-pointer"
                  title={`返回${backLabel}`}
                >
                  ← {backLabel}
                </button>
              )}
              <span className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
                編輯任務
              </span>
              {(() => {
                // header 顯示所屬專案的客戶 / 品牌（只這兩個），方便一眼知道是誰的案子
                const sel = projects.find((p) => p.id === projectId);
                if (!sel || !(sel.customerName || sel.brandName)) return null;
                return (
                  <div className="flex items-center gap-2 min-w-0 pl-2 border-l border-rule text-[13px]">
                    {sel.customerName && (
                      <span className="truncate">
                        <span className="text-text-faint">客戶 </span>
                        <span className="font-semibold">{sel.customerName}</span>
                      </span>
                    )}
                    {sel.brandName && (
                      <span className="truncate">
                        <span className="text-text-faint">品牌 </span>
                        <span className="font-semibold">{sel.brandName}</span>
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
                title="關閉 (ESC)"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5">
              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-x-6 gap-y-4">
              {/* 左欄：欄位編輯 */}
              <div className="space-y-4 min-w-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border border-transparent hover:border-rule hover:bg-surface-2 text-2xl font-bold tracking-tight leading-tight focus:outline-none focus:border-blue focus:bg-surface-2 rounded-md px-2 -mx-2 py-1 transition-colors cursor-text"
                placeholder="任務標題（點此即可編輯）"
              />

              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="描述（選填）"
                mentionUsers={users}
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
                <div className="sm:col-span-2">
                  <DrawerField label="負責人（可多選）" as="div">
                    <AssigneePicker
                      users={users}
                      selectedIds={assigneeIds}
                      onChange={setAssigneeIds}
                    />
                  </DrawerField>
                </div>
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

              <ChecklistSection taskId={task.id} />

              <LinkSection taskId={task.id} />
              </div>

              {/* 右欄：留言與動態（寬螢幕並排，省去縱向捲動）*/}
              <div className="min-w-0 pt-4 border-t border-rule lg:pt-0 lg:border-t-0 lg:border-l lg:pl-6">
                <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-3">
                  留言與動態
                </div>

                {timelineLoading ? (
                  <div className="text-sm text-text-faint py-2">載入中…</div>
                ) : timeline.length === 0 ? (
                  <div className="text-sm text-text-faint py-2">
                    還沒有留言或動態，留下第一則討論吧。
                  </div>
                ) : (
                  <ol className="space-y-3">
                    {timeline.map((item) =>
                      item.kind === "comment" ? (
                        <li key={`c-${item.id}`} className="flex gap-2.5">
                          <TimelineAvatar author={item.author} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">
                                {item.author.name}
                              </span>
                              <span className="text-[12.5px] text-text-faint">
                                {relTime(item.createdAtIso)}
                                {item.edited && "・已編輯"}
                              </span>
                              {item.author.id != null &&
                                item.author.id === currentUserId &&
                                editingId !== item.id && (
                                  <span className="ml-auto flex items-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingId(item.id);
                                        setEditBody(item.body);
                                      }}
                                      className="text-[12.5px] text-text-faint hover:text-blue cursor-pointer"
                                    >
                                      編輯
                                    </button>
                                    <button
                                      onClick={() => handleDeleteComment(item.id)}
                                      className="text-[12.5px] text-text-faint hover:text-red cursor-pointer"
                                    >
                                      刪除
                                    </button>
                                  </span>
                                )}
                            </div>
                            {editingId === item.id ? (
                              <div className="mt-1 space-y-1.5">
                                <RichTextEditor
                                  value={editBody}
                                  onChange={setEditBody}
                                  placeholder="編輯留言…"
                                  mentionUsers={users}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={isRichTextEmpty(editBody)}
                                    className="bg-blue text-white px-3 py-1 rounded-md text-xs font-semibold cursor-pointer hover:brightness-95 disabled:opacity-40"
                                  >
                                    更新
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-3 py-1 rounded-md text-xs font-medium text-text-dim hover:bg-rule-soft cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <RichTextView
                                html={item.body}
                                className="text-sm text-text-dim break-words mt-0.5"
                              />
                            )}
                          </div>
                        </li>
                      ) : (
                        <li
                          key={`a-${item.id}`}
                          className="flex items-center gap-2 text-xs text-text-faint pl-1"
                        >
                          <span className="w-1 h-1 rounded-full bg-text-faint/60 shrink-0" />
                          <span className="truncate">
                            <b className="text-text-dim font-medium">
                              {item.actor.name}
                            </b>{" "}
                            {activityText(item)}
                          </span>
                          <span className="ml-auto shrink-0">
                            {relTime(item.createdAtIso)}
                          </span>
                        </li>
                      )
                    )}
                  </ol>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  <RichTextEditor
                    value={commentBody}
                    onChange={setCommentBody}
                    placeholder="留言…"
                    mentionUsers={users}
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={isRichTextEmpty(commentBody) || posting}
                    className="self-end bg-blue text-white px-4 py-1.5 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
                  >
                    {posting ? "送出中…" : "送出留言"}
                  </button>
                </div>
              </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-rule flex flex-wrap items-center gap-2">
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
      </div>
    </div>
  );
}

// ==== 任務依賴（drawer 內）====

// ==== 工作清單（drawer 內，含拖排）====

function ChecklistSection({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<ViewChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditingId(null);
    getTaskChecklist(taskId).then((its) => {
      if (!cancelled) {
        setItems(its);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function refetch() {
    setItems(await getTaskChecklist(taskId));
  }

  function handleAdd() {
    if (!newContent.trim() || adding) return;
    setAdding(true);
    startTransition(async () => {
      const res = await addChecklistItem({ taskId, content: newContent });
      if (res.ok) {
        setNewContent("");
        await refetch();
        router.refresh();
      } else {
        alert(res.error);
      }
      setAdding(false);
    });
  }

  function handleToggle(item: ViewChecklistItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
    );
    startTransition(async () => {
      await toggleChecklistItem({ id: item.id, done: !item.done });
      router.refresh();
    });
  }

  function handleSaveEdit() {
    if (!editingId || !editContent.trim()) return;
    const id = editingId;
    startTransition(async () => {
      const res = await updateChecklistItem({ id, content: editContent });
      if (res.ok) {
        setEditingId(null);
        await refetch();
      } else {
        alert(res.error);
      }
    });
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(async () => {
      await deleteChecklistItem(id);
      router.refresh();
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    const idx = reordered.findIndex((i) => i.id === active.id);
    const prevPos = idx > 0 ? reordered[idx - 1].position : 0;
    const nextPos =
      idx < reordered.length - 1 ? reordered[idx + 1].position : prevPos + 2048;
    const newPos = (prevPos + nextPos) / 2;
    setItems(
      reordered.map((i) =>
        i.id === active.id ? { ...i, position: newPos } : i
      )
    );
    startTransition(async () => {
      await reorderChecklistItem({ id: active.id as string, position: newPos });
      router.refresh();
    });
  }

  const done = items.filter((i) => i.done).length;

  return (
    <div className="pt-4 border-t border-rule">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
          工作清單
        </span>
        {items.length > 0 && (
          <span className="text-[12.5px] text-text-faint tabular">
            {done}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="h-1 bg-rule rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-green rounded-full transition-[width] duration-200"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-faint py-1">載入中…</div>
      ) : (
        <DndContext
          id={`checklist-${taskId}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  editContent={editContent}
                  onToggle={() => handleToggle(item)}
                  onStartEdit={() => {
                    setEditingId(item.id);
                    setEditContent(item.content);
                  }}
                  onEditChange={setEditContent}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="新增清單項…"
          className="flex-1 bg-surface-2 border border-rule rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
        />
        <button
          onClick={handleAdd}
          disabled={!newContent.trim() || adding}
          className="bg-rule-soft hover:bg-rule text-text-dim px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40"
        >
          ＋
        </button>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  editing,
  editContent,
  onToggle,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  item: ViewChecklistItem;
  editing: boolean;
  editContent: string;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-text-faint hover:text-text-dim cursor-grab active:cursor-grabbing text-xs px-0.5 touch-none"
        title="拖曳排序"
        aria-label="拖曳排序"
      >
        ⠿
      </button>
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        className="w-4 h-4 accent-green cursor-pointer shrink-0"
      />
      {editing ? (
        <div className="flex-1 flex items-center gap-1.5">
          <input
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEdit();
              } else if (e.key === "Escape") {
                onCancelEdit();
              }
            }}
            autoFocus
            className="flex-1 bg-surface border border-blue rounded-md px-2 py-1 text-sm focus:outline-none"
          />
          <button
            onClick={onSaveEdit}
            disabled={!editContent.trim()}
            className="text-[12.5px] text-blue font-semibold cursor-pointer disabled:opacity-40"
          >
            存
          </button>
          <button
            onClick={onCancelEdit}
            className="text-[12.5px] text-text-faint cursor-pointer"
          >
            取消
          </button>
        </div>
      ) : (
        <>
          <span
            onDoubleClick={onStartEdit}
            className={`flex-1 text-sm break-words ${
              item.done ? "line-through text-text-faint" : "text-text-dim"
            }`}
          >
            {item.content}
          </span>
          <span className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <button
              onClick={onStartEdit}
              className="text-[12.5px] text-text-faint hover:text-blue cursor-pointer"
            >
              編輯
            </button>
            <button
              onClick={onDelete}
              className="text-[12.5px] text-text-faint hover:text-red cursor-pointer"
            >
              刪除
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function DrawerField({
  label,
  children,
  // 複合控制項（如負責人 picker）要傳 as="div"：<label> 會把空白處的 click 轉發給
  // 內部第一個按鈕（chip 的 ✕），導致點欄位空白就誤刪第一位負責人。
  as: Wrapper = "label",
}: {
  label: string;
  children: React.ReactNode;
  as?: "label" | "div";
}) {
  return (
    <Wrapper className="block">
      <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
        {label}
      </div>
      {children}
    </Wrapper>
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

const avatarGradientMap: Record<TimelineAuthor["gradient"], string> = {
  w: "from-blue to-purple",
  l: "from-green to-teal",
  s: "from-pink to-orange",
  y: "from-purple to-pink",
};

function TimelineAvatar({ author }: { author: TimelineAuthor }) {
  const custom = author.avatarColor;
  return (
    <div
      className={`w-7 h-7 shrink-0 rounded-full text-white text-[12.5px] font-bold flex items-center justify-center ${
        custom ? "" : `bg-gradient-to-br ${avatarGradientMap[author.gradient]}`
      }`}
      style={custom ? { background: resolveProjectColor(custom) } : undefined}
      title={author.name}
    >
      {author.initial}
    </div>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function activityText(a: ViewActivity): string {
  switch (a.field) {
    case "CREATED":
      return "建立了這個任務";
    case "STATUS":
      return `將狀態改為「${a.toValue}」`;
    case "ASSIGNEE":
      return `將負責人改為「${a.toValue ?? "未指派"}」`;
    case "PRIORITY":
      return `將優先級改為「${a.toValue}」`;
    case "START_DATE":
      return `將開始日改為「${a.toValue ?? "無"}」`;
    case "DUE_DATE":
      return `將截止日改為「${a.toValue ?? "無"}」`;
    default:
      return "更新了任務";
  }
}

function ProjectTag({ project }: { project: ViewProject }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[12.5px] font-semibold"
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
  const custom = user.avatarColor;
  return (
    <div
      className={`w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-1 ring-surface ${
        custom ? "" : `bg-gradient-to-br ${map[user.gradient]}`
      }`}
      style={custom ? { background: resolveProjectColor(custom) } : undefined}
      title={user.name}
    >
      {user.initial}
    </div>
  );
}

// 卡片多負責人：最多 3 顆頭像（重疊）+ 溢出 +N
function AssigneeAvatars({ task }: { task: ViewTask }) {
  const list =
    task.assignees && task.assignees.length > 0
      ? task.assignees
      : task.assignee
      ? [task.assignee]
      : [];
  if (list.length === 0) return null;
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((u) => (
          <MiniAvatar key={u.id} user={u} />
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-1 text-[11px] text-text-faint tabular">+{extra}</span>
      )}
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
      className={`text-[12.5px] px-1.5 py-0.5 rounded-[5px] font-semibold tabular ml-auto ${map[kind]}`}
    >
      {children}
    </span>
  );
}

// ==== 卡片聯繫（drawer 內）— 跨團隊交流，點聯繫卡片 peek 預覽 ====
function LinkSection({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [links, setLinks] = useState<ViewTaskLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ViewTaskLink[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setQuery("");
    setPicking(false);
    getTaskLinks(taskId).then((d) => {
      if (!cancelled) {
        setLinks(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function refetch() {
    setLinks(await getTaskLinks(taskId));
  }

  async function openPicker() {
    setPicking(true);
    setError(null);
    setCandidates(await getLinkableTasks(taskId));
  }

  const linkedIds = new Set(links.map((l) => l.id));
  const q = query.trim().toLowerCase();
  const filtered = candidates.filter(
    (c) => !linkedIds.has(c.id) && (!q || c.title.toLowerCase().includes(q))
  );

  function handleAdd(linkedId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addTaskLink({ taskId, linkedId });
      if (res.ok) {
        setQuery("");
        await refetch();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleRemove(linkedId: string) {
    startTransition(async () => {
      await removeTaskLink({ taskId, linkedId });
      await refetch();
      router.refresh();
    });
  }

  return (
    <div className="pt-4 border-t border-rule">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
          聯繫卡片
        </div>
        <button
          type="button"
          onClick={() => (picking ? setPicking(false) : openPicker())}
          className="text-[12.5px] text-blue hover:underline cursor-pointer"
        >
          {picking ? "收起" : "＋ 聯繫卡片"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-text-faint">載入中…</div>
      ) : links.length === 0 && !picking ? (
        <div className="text-sm text-text-faint">尚未聯繫任何卡片</div>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li
              key={l.id}
              className="group flex items-center gap-2 bg-surface-2 rounded-lg px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => setPeekId(l.id)}
                className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
                title="點擊預覽這張卡片"
              >
                <span className="text-blue text-xs">🔗</span>
                <span className="flex-1 text-sm truncate group-hover:text-blue">
                  {l.title}
                </span>
                {l.teamName && (
                  <span className="text-[11px] text-text-faint shrink-0">
                    {l.teamName}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(l.id)}
                title="移除聯繫"
                className="text-text-faint hover:text-red text-xs opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            placeholder="搜尋要聯繫的卡片…"
            className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
          />
          <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-rule divide-y divide-rule">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-faint text-center">
                {q ? "找不到符合的卡片" : "沒有可聯繫的卡片"}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleAdd(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 cursor-pointer"
                >
                  <span className="flex-1 text-sm truncate">{c.title}</span>
                  {c.teamName && (
                    <span className="text-[11px] text-text-faint shrink-0">
                      {c.teamName}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <div className="mt-1.5 text-xs text-red">{error}</div>}

      {peekId && <TaskPeek id={peekId} onClose={() => setPeekId(null)} />}
    </div>
  );
}

// ==== 聯繫卡片 peek 預覽（唯讀）====
function TaskPeek({ id, onClose }: { id: string; onClose: () => void }) {
  const [peek, setPeek] = useState<ViewTaskPeek | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTaskPeek(id).then((d) => {
      if (!cancelled) {
        setPeek(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-surface rounded-2xl shadow-2xl w-[420px] max-w-[92vw] max-h-[80dvh] overflow-auto"
      >
        <div className="px-5 py-3 border-b border-rule flex items-center gap-2">
          <span className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider">
            卡片預覽
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-rule-soft hover:bg-rule text-text-dim flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-text-faint text-center">
            載入中…
          </div>
        ) : !peek ? (
          <div className="px-5 py-8 text-sm text-text-faint text-center">
            找不到這張卡片
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <div className="text-lg font-bold tracking-tight">{peek.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="px-2 py-0.5 rounded-md bg-surface-2 font-semibold">
                {statusOptions.find((s) => s.value === peek.status)?.label ??
                  peek.status}
              </span>
              {peek.teamName && (
                <span className="px-2 py-0.5 rounded-md bg-rule-soft text-text-dim">
                  {peek.teamName}
                </span>
              )}
              {peek.projectName && (
                <span className="px-2 py-0.5 rounded-md bg-rule-soft text-text-dim">
                  {peek.projectName}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-text-dim">
              <div>
                <span className="text-text-faint">負責人：</span>
                {peek.assigneeName ?? "未指派"}
              </div>
              <div>
                <span className="text-text-faint">截止：</span>
                {peek.dueIso ? peek.dueIso.slice(0, 10) : "—"}
              </div>
            </div>
            {peek.description && (
              <RichTextView
                html={peek.description}
                className="text-sm text-text-dim break-words pt-2 border-t border-rule"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

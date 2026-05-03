"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/server/actions";
import type {
  ViewProject,
  ViewUser,
  TaskStatus,
  TaskPriority,
} from "@/lib/data";

const statuses: { value: TaskStatus; label: string; color: string }[] = [
  { value: "TODO", label: "尚未開始", color: "var(--text-faint)" },
  { value: "IN_PROGRESS", label: "進行中", color: "var(--orange)" },
  { value: "WAITING_REVIEW", label: "等待驗收", color: "var(--purple)" },
  { value: "ON_HOLD", label: "擱置", color: "var(--red)" },
  { value: "DONE", label: "已完成", color: "var(--green)" },
];

const priorities: { value: TaskPriority; label: string; color: string }[] = [
  { value: "LOW", label: "◾️ 低", color: "var(--text-faint)" },
  { value: "MEDIUM", label: "🔸 中", color: "var(--orange)" },
  { value: "HIGH", label: "🔥 高", color: "var(--red)" },
];

export function NewTaskDialog({
  open,
  onClose,
  projects,
  users,
  defaultStatus = "TODO",
  defaultProjectId,
  defaultAssigneeId,
}: {
  open: boolean;
  onClose: () => void;
  projects: ViewProject[];
  users: ViewUser[];
  defaultStatus?: TaskStatus;
  defaultProjectId?: string;
  defaultAssigneeId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // 開關時 reset
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setStatus(defaultStatus);
      setPriority("MEDIUM");
      setProjectId(defaultProjectId ?? "");
      setAssigneeId(defaultAssigneeId ?? "");
      setStartDate("");
      setDueDate("");
      setError(null);
    }
  }, [open, defaultStatus, defaultProjectId, defaultAssigneeId]);

  // ESC 關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTask({
        title,
        description: description || null,
        status,
        priority,
        projectId: projectId || null,
        assigneeId: assigneeId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 z-40 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed left-1/2 top-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[92vw] max-h-[88vh] flex flex-col bg-surface rounded-2xl shadow-2xl transition-all duration-200 ${
          open
            ? "opacity-100 scale-100 -translate-y-1/2"
            : "opacity-0 scale-95 -translate-y-[55%] pointer-events-none"
        }`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight">新任務</h2>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
            <Field label="標題" required>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                placeholder="例：i18n config 拆兩份 schema"
                maxLength={200}
              />
            </Field>

            <Field label="描述">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface resize-none"
                placeholder="（選填）可填背景脈絡 / 驗收條件 / 連結"
                maxLength={2000}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="狀態">
                <Select
                  value={status}
                  onChange={(v) => setStatus(v as TaskStatus)}
                  options={statuses.map((s) => ({
                    value: s.value,
                    label: s.label,
                    color: s.color,
                  }))}
                />
              </Field>
              <Field label="優先級">
                <Select
                  value={priority}
                  onChange={(v) => setPriority(v as TaskPriority)}
                  options={priorities.map((p) => ({
                    value: p.value,
                    label: p.label,
                  }))}
                />
              </Field>
              <Field label="專案">
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    { value: "", label: "（無）" },
                    ...projects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                />
              </Field>
              <Field label="負責人">
                <Select
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={[
                    { value: "", label: "未指派" },
                    ...users.map((u) => ({ value: u.id, label: u.name })),
                  ]}
                />
              </Field>
              <Field label="開始日">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
              <Field label="截止日">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
            </div>

            {error && (
              <div className="text-xs text-red bg-red/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-rule flex items-center gap-2">
            <span className="text-[11px] text-text-faint">⌘ Enter 送出</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-rule-soft hover:bg-rule rounded-lg font-medium text-sm text-text-dim cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? "建立中..." : "建立任務"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface appearance-none bg-[length:14px] bg-no-repeat bg-[right_10px_center] pr-8"
      style={{
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236E6E73' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,
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

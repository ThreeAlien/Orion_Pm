"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProject, archiveProject } from "@/server/actions";
import {
  NAMED_PROJECT_COLORS,
  resolveProjectColor,
  type ViewUser,
  type ProjectStatus,
} from "@/lib/data";
import type { ViewProjectDetail } from "@/server/queries";

const PRESET_COLORS = [
  { hex: NAMED_PROJECT_COLORS.red, label: "紅" },
  { hex: NAMED_PROJECT_COLORS.orange, label: "橘" },
  { hex: NAMED_PROJECT_COLORS.yellow, label: "黃" },
  { hex: NAMED_PROJECT_COLORS.green, label: "綠" },
  { hex: NAMED_PROJECT_COLORS.teal, label: "青" },
  { hex: NAMED_PROJECT_COLORS.blue, label: "藍" },
  { hex: NAMED_PROJECT_COLORS.purple, label: "紫" },
  { hex: NAMED_PROJECT_COLORS.pink, label: "粉" },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "PLANNING", label: "規劃中" },
  { value: "IN_PROGRESS", label: "進行中" },
  { value: "PAUSED", label: "暫停" },
  { value: "DONE", label: "已完成" },
];

export function EditProjectButton({
  project,
  users,
}: {
  project: ViewProjectDetail;
  users: ViewUser[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3.5 py-2 bg-rule-soft hover:bg-rule rounded-[10px] font-medium text-[13px] text-text-dim cursor-pointer"
      >
        編輯
      </button>
      <EditProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        project={project}
        users={users}
      />
    </>
  );
}

function EditProjectDialog({
  open,
  onClose,
  project,
  users,
}: {
  open: boolean;
  onClose: () => void;
  project: ViewProjectDetail;
  users: ViewUser[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(resolveProjectColor(project.color));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [saving, setSaving] = useState(false);

  // sync from project
  useEffect(() => {
    if (open) {
      setName(project.name);
      setColor(resolveProjectColor(project.color));
      setStatus(project.status);
      setStartDate(
        project.startDate ? project.startDate.toISOString().slice(0, 10) : ""
      );
      setEndDate(
        project.endDate ? project.endDate.toISOString().slice(0, 10) : ""
      );
      setOwnerId(project.ownerId);
      setSaving(false);
    }
  }, [open, project]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ownerId) return;
    setSaving(true);
    startTransition(async () => {
      await updateProject({
        id: project.id,
        name,
        color,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        ownerId,
      });
      setSaving(false);
      router.refresh();
      onClose();
    });
  }

  function handleArchive() {
    if (!confirm(`封存「${project.name}」？該專案的任務 / 文件不會刪除，但專案會從列表消失。`))
      return;
    startTransition(async () => {
      await archiveProject(project.id);
      router.refresh();
      onClose();
      router.push("/projects");
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
        className={`fixed left-1/2 top-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[92vw] max-h-[88dvh] flex flex-col bg-surface rounded-2xl shadow-2xl transition-all duration-200 ${
          open
            ? "opacity-100 scale-100 -translate-y-1/2"
            : "opacity-0 scale-95 -translate-y-[55%] pointer-events-none"
        }`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight">編輯專案</h2>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
            <Field label="專案名稱" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                maxLength={120}
              />
            </Field>

            <Field label="顏色">
              <div className="flex gap-2 items-center flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs transition-transform ${
                      color.toLowerCase() === c.hex.toLowerCase()
                        ? "ring-2 ring-text ring-offset-2 ring-offset-surface scale-105"
                        : "hover:scale-105"
                    }`}
                    style={{ background: c.hex }}
                    title={c.label}
                  >
                    {color.toLowerCase() === c.hex.toLowerCase() ? "✓" : ""}
                  </button>
                ))}
                <label
                  className="w-9 h-9 rounded-lg cursor-pointer overflow-hidden ring-1 ring-rule hover:scale-105 transition-transform relative"
                  style={{
                    background:
                      "conic-gradient(from 0deg, #ff3b30, #ff9500, #ffcc00, #34c759, #5ac8fa, #007aff, #af52de, #ff2d55, #ff3b30)",
                  }}
                  title="自訂顏色"
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs drop-shadow pointer-events-none">
                    {!PRESET_COLORS.some(
                      (p) => p.hex.toLowerCase() === color.toLowerCase()
                    )
                      ? "✓"
                      : "+"}
                  </span>
                </label>
                <span className="text-[11px] text-text-faint tabular ml-1">
                  {color.toUpperCase()}
                </span>
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="狀態">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="負責人">
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
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
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-rule flex items-center gap-2">
            <button
              type="button"
              onClick={handleArchive}
              className="px-3 py-2 rounded-lg bg-red/[.08] hover:bg-red/[.16] border border-red/30 text-red text-sm font-semibold cursor-pointer"
              title="封存此專案（之後可在封存區還原）"
            >
              封存
            </button>
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
              disabled={saving || !name.trim() || !ownerId}
              className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
            >
              {saving ? "儲存中..." : "儲存"}
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

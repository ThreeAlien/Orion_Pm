"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocument } from "@/server/actions";
import type { ViewUser, ViewProject, DocType } from "@/lib/data";

const docTypes: { value: DocType; label: string; icon: string }[] = [
  { value: "MEETING", label: "會議記錄", icon: "🗓️" },
  { value: "DEV_NOTE", label: "開發筆記", icon: "🧑‍💻" },
  { value: "PRODUCT", label: "產品文件", icon: "📑" },
  { value: "RESEARCH", label: "研究報告", icon: "🔍" },
  { value: "TEST", label: "測試紀錄", icon: "🔦" },
  { value: "TEAM_GUIDE", label: "團隊指南", icon: "📘" },
];

export function NewDocumentButton({
  users,
  projects,
  currentUserId,
}: {
  users: ViewUser[];
  projects: ViewProject[];
  currentUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue text-white px-3.5 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer hover:brightness-95"
      >
        ＋ 新文件
      </button>
      <NewDocumentDialog
        open={open}
        onClose={() => setOpen(false)}
        users={users}
        projects={projects}
        currentUserId={currentUserId}
      />
    </>
  );
}

function NewDocumentDialog({
  open,
  onClose,
  users,
  projects,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  users: ViewUser[];
  projects: ViewProject[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<DocType>("MEETING");
  const [date, setDate] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDocType("MEETING");
      setDate(new Date().toISOString().slice(0, 10));
      setAuthorId(currentUserId ?? users[0]?.id ?? "");
      setProjectId("");
      setSaving(false);
    }
  }, [open, users, currentUserId]);

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
    if (!name.trim()) return;
    setSaving(true);
    startTransition(async () => {
      await createDocument({
        name,
        docType,
        date: date || null,
        authorId: authorId || null,
        projectId: projectId || null,
      });
      setSaving(false);
      router.refresh();
      onClose();
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
        className={`fixed left-1/2 top-1/2 -translate-x-1/2 z-50 w-[480px] max-w-[92vw] bg-surface rounded-2xl shadow-2xl transition-all duration-200 ${
          open
            ? "opacity-100 scale-100 -translate-y-1/2"
            : "opacity-0 scale-95 -translate-y-[55%] pointer-events-none"
        }`}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight">新文件</h2>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <Field label="文件名稱" required>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                placeholder="例：2026-W18 weekly sync"
                maxLength={200}
              />
            </Field>

            <Field label="文件類型">
              <div className="grid grid-cols-3 gap-2">
                {docTypes.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setDocType(t.value)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      docType === t.value
                        ? "border-blue bg-blue/[.08] text-blue"
                        : "border-rule hover:border-rule-strong bg-surface-2 text-text-dim"
                    }`}
                  >
                    <div className="text-base mb-0.5">{t.icon}</div>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="日期">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
              <Field label="作者">
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="關聯專案">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                >
                  <option value="">（無）</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-rule flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-rule-soft hover:bg-rule rounded-lg font-medium text-sm text-text-dim cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
            >
              {saving ? "建立中..." : "建立文件"}
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

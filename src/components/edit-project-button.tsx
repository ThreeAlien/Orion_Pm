"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProject, archiveProject } from "@/server/actions";
import {
  NAMED_PROJECT_COLORS,
  resolveProjectColor,
  type ViewUser,
  type ViewTeam,
  type ProjectStatus,
} from "@/lib/data";
import type { ViewProjectDetail } from "@/server/queries";
import {
  AttributeSelect,
  CategoryMultiSelect,
  Field,
  SectionLabel,
  SourceCombobox,
  StatusSelect,
} from "@/components/project-form-fields";

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

export function EditProjectButton({
  project,
  users,
  teams,
  children,
}: {
  project: ViewProjectDetail;
  users: ViewUser[];
  teams: ViewTeam[];
  // 給自訂觸發元素（如整張專案卡）用；沒給就用預設「編輯」按鈕
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children ? (
        <div onClick={() => setOpen(true)} className="cursor-pointer">
          {children}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3.5 py-2 bg-rule-soft hover:bg-rule rounded-[10px] font-medium text-[14px] text-text-dim cursor-pointer"
        >
          編輯
        </button>
      )}
      <EditProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        project={project}
        users={users}
        teams={teams}
      />
    </>
  );
}

function EditProjectDialog({
  open,
  onClose,
  project,
  users,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  project: ViewProjectDetail;
  users: ViewUser[];
  teams: ViewTeam[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(resolveProjectColor(project.color));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [teamId, setTeamId] = useState(project.teamId ?? "");
  const [customerName, setCustomerName] = useState(project.customerName ?? "");
  const [taxId, setTaxId] = useState(project.taxId ?? "");
  const [brandName, setBrandName] = useState(project.brandName ?? "");
  const [category, setCategory] = useState<string[]>(project.category ?? []);
  const [attribute, setAttribute] = useState(project.attribute ?? "");
  const [source, setSource] = useState(project.source ?? "");
  const [salesName, setSalesName] = useState(project.salesName ?? "");
  const [background, setBackground] = useState(project.background ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [fileLinks, setFileLinks] = useState<{ label: string; url: string }[]>(
    project.fileLinks ?? []
  );
  const [linksOpen, setLinksOpen] = useState(false);
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
      setTeamId(project.teamId ?? "");
      setCustomerName(project.customerName ?? "");
      setTaxId(project.taxId ?? "");
      setBrandName(project.brandName ?? "");
      setCategory(project.category ?? []);
      setAttribute(project.attribute ?? "");
      setSource(project.source ?? "");
      setSalesName(project.salesName ?? "");
      setBackground(project.background ?? "");
      setNotes(project.notes ?? "");
      setFileLinks(project.fileLinks ?? []);
      setLinksOpen((project.fileLinks?.length ?? 0) > 0);
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 open 邊緣或換專案時 reset，勿隨 refresh-loop 重跑而覆蓋編輯中的內容
  }, [open, project.id]);

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
        teamId: teamId || null,
        customerName: customerName || null,
        taxId: taxId || null,
        brandName: brandName || null,
        category,
        attribute: attribute || null,
        source: source || null,
        salesName: salesName || null,
        background: background || null,
        notes: notes || null,
        fileLinks,
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
        className={`fixed left-1/2 top-1/2 -translate-x-1/2 z-50 w-[880px] max-w-[94vw] max-h-[90dvh] flex flex-col bg-surface rounded-2xl shadow-2xl transition-all duration-200 ${
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
                <span className="text-[12.5px] text-text-faint tabular ml-1">
                  {color.toUpperCase()}
                </span>
              </div>
            </Field>

            <SectionLabel>案件資訊</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="案件狀態">
                <StatusSelect value={status} onChange={setStatus} />
              </Field>
              <Field label="案件屬性">
                <AttributeSelect value={attribute} onChange={setAttribute} />
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
              <Field label="團隊">
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                >
                  <option value="">未分類</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
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

            <Field label="客戶需求品項">
              <CategoryMultiSelect value={category} onChange={setCategory} />
            </Field>

            <SectionLabel>客戶資訊</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="客戶名稱">
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  placeholder="公司全名"
                  maxLength={120}
                />
              </Field>
              <Field label="品牌名稱">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  placeholder="品牌名稱"
                  maxLength={120}
                />
              </Field>
              <Field label="客戶統編">
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  placeholder="8 碼數字"
                  maxLength={20}
                />
              </Field>
              <Field label="業務名稱">
                <input
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                  placeholder="負責這案的業務"
                  maxLength={60}
                />
              </Field>
              <Field label="案件來源">
                <SourceCombobox value={source} onChange={setSource} listId="edit-project-source-presets" />
              </Field>
            </div>

            <SectionLabel>備註</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="專案背景說明">
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="這個專案的來龍去脈、目標、範圍…讓團隊快速了解脈絡"
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
              <Field label="注意事項">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="執行時要特別留意的事項、雷區、客戶要求…"
                  className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:border-blue focus:bg-surface"
                />
              </Field>
            </div>

            {/* 檔案統籌表：可收合的連結清單 */}
            <div className="border border-rule rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setLinksOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-surface-2 hover:bg-rule-soft cursor-pointer text-sm font-semibold"
              >
                <span className="text-text-faint text-xs">
                  {linksOpen ? "▼" : "▶"}
                </span>
                📎 檔案統籌表
                {fileLinks.length > 0 && (
                  <span className="text-text-faint font-normal text-xs tabular">
                    （{fileLinks.length}）
                  </span>
                )}
              </button>
              {linksOpen && (
                <div className="p-3 space-y-2 border-t border-rule">
                  {fileLinks.length === 0 && (
                    <div className="text-xs text-text-faint py-1">
                      還沒有連結，點下方新增。填名稱 + 網址，存檔後就能快速點開。
                    </div>
                  )}
                  {fileLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        value={link.label}
                        onChange={(e) =>
                          setFileLinks((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, label: e.target.value } : l
                            )
                          )
                        }
                        placeholder="名稱（如：報價單）"
                        maxLength={200}
                        className="w-2/5 bg-surface-2 border border-rule rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                      />
                      <input
                        value={link.url}
                        onChange={(e) =>
                          setFileLinks((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, url: e.target.value } : l
                            )
                          )
                        }
                        placeholder="貼上連結網址 https://…"
                        maxLength={2000}
                        className="flex-1 min-w-0 bg-surface-2 border border-rule rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
                      />
                      {link.url && (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-rule-soft hover:bg-rule text-text-dim flex-shrink-0"
                          title="開啟連結"
                        >
                          ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setFileLinks((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red/[.12] text-text-faint hover:text-red flex-shrink-0"
                        title="刪除這列"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setFileLinks((prev) => [...prev, { label: "", url: "" }])
                    }
                    className="text-xs text-blue hover:underline cursor-pointer mt-1"
                  >
                    ＋ 新增一列
                  </button>
                </div>
              )}
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

"use client";

// 專案新增/編輯表單的共用欄位元件 — new-project-button.tsx / edit-project-button.tsx 共用。
import { useEffect, useRef, useState } from "react";
import {
  PROJECT_ATTRIBUTE_OPTIONS,
  PROJECT_CATEGORIES,
  PROJECT_SOURCE_PRESETS,
  PROJECT_STATUS_OPTIONS,
  type ProjectStatus,
} from "@/lib/data";

// 欄位 label + 內容的統一排版（原本 new/edit 兩檔各自複製一份，抽出共用）
export function Field({
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
      <div className="text-[12.5px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}

// 表單內分區小標題，用來把一長串欄位拆成看得懂的群組（不擠成一坨）
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5 text-[12.5px] text-text-dim font-bold uppercase tracking-wider border-t border-rule first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}

const selectClass =
  "w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface";

// 案件狀態 — 3 態下拉
export function StatusSelect({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (v: ProjectStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProjectStatus)}
      className={selectClass}
    >
      {PROJECT_STATUS_OPTIONS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// 案件屬性 — 一般案件 / 專案（可留空 = 未設定）
export function AttributeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      <option value="">（未設定）</option>
      {PROJECT_ATTRIBUTE_OPTIONS.map((a) => (
        <option key={a.value} value={a.value}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

// 案件來源 — 下拉常用選項＋可自填（datalist combobox）
export function SourceCombobox({
  value,
  onChange,
  listId,
}: {
  value: string;
  onChange: (v: string) => void;
  // 同頁若出現多個 combobox（理論上不會），給不同 id 避免 datalist 碰撞
  listId?: string;
}) {
  const id = listId ?? "project-source-presets";
  return (
    <>
      <input
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="官網 / 轉介 / 業務開發…（可自填）"
        maxLength={100}
        className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue focus:bg-surface"
      />
      <datalist id={id}>
        {PROJECT_SOURCE_PRESETS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

// 客戶需求品項 — 10 選多選，已選顯示成可移除 chips（互動參考 assignee-picker.tsx）
export function CategoryMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(code: string) {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else onChange([...value, code]);
  }

  const candidates = PROJECT_CATEGORIES.filter((c) => !value.includes(c.value));

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {value.length === 0 && (
          <span className="text-sm text-text-faint">未選擇</span>
        )}
        {value.map((code) => {
          const opt = PROJECT_CATEGORIES.find((c) => c.value === code);
          return (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-full bg-blue/[.1] text-blue text-[13px] font-medium"
            >
              <span className="max-w-[10rem] truncate">{opt?.label ?? code}</span>
              <button
                type="button"
                onClick={() => toggle(code)}
                className="text-blue/60 hover:text-red cursor-pointer leading-none"
                title="移除"
              >
                ✕
              </button>
            </span>
          );
        })}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center px-2.5 py-1 rounded-full border border-dashed border-rule text-[13px] text-text-dim hover:text-blue hover:border-blue cursor-pointer"
          >
            ＋ 加項目
          </button>
        )}
      </div>

      {open && (
        <div className="border border-rule rounded-lg overflow-hidden bg-surface-2">
          <div className="max-h-44 overflow-y-auto">
            {candidates.length === 0 ? (
              <div className="px-3 py-3 text-sm text-text-faint text-center">
                已全選
              </div>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(c.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-rule-soft cursor-pointer"
                >
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-[12.5px] text-blue">＋</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

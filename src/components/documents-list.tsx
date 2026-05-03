// Documents 列表頁 — 按 docType 分群 + 點擊開 detail dialog
"use client";

import { useState } from "react";
import type { ViewDocument } from "@/server/queries";
import type { DocType, ViewUser, ViewProject } from "@/lib/data";
import { NewDocumentButton } from "./new-document-button";
import { DocumentDetailDialog } from "./document-detail-dialog";

const docTypeMap: Record<
  DocType,
  { label: string; icon: string; tone: string }
> = {
  MEETING: { label: "會議記錄", icon: "🗓️", tone: "bg-blue/[.12]" },
  RESEARCH: { label: "研究報告", icon: "🔍", tone: "bg-orange/[.13]" },
  DEV_NOTE: { label: "開發筆記", icon: "🧑‍💻", tone: "bg-green/[.14]" },
  PRODUCT: { label: "產品文件", icon: "📑", tone: "bg-purple/[.13]" },
  TEST: { label: "測試紀錄", icon: "🔦", tone: "bg-yellow/[.18]" },
  TEAM_GUIDE: { label: "團隊指南", icon: "📘", tone: "bg-pink/[.13]" },
};

export function DocumentsList({
  documents,
  users,
  projects,
  currentUserId,
}: {
  documents: ViewDocument[];
  users: ViewUser[];
  projects: ViewProject[];
  currentUserId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDoc = selectedId
    ? documents.find((d) => d.id === selectedId) ?? null
    : null;

  // group by docType
  const grouped = new Map<DocType, ViewDocument[]>();
  for (const d of documents) {
    if (!grouped.has(d.docType)) grouped.set(d.docType, []);
    grouped.get(d.docType)!.push(d);
  }

  const order: DocType[] = [
    "MEETING",
    "DEV_NOTE",
    "PRODUCT",
    "RESEARCH",
    "TEST",
    "TEAM_GUIDE",
  ];

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <h1 className="text-[28px] font-bold tracking-tight">Documents</h1>
        <span className="text-[13px] text-text-dim tabular">
          {documents.length} 份文件
        </span>
        <div className="flex-1" />
        <NewDocumentButton
          users={users}
          projects={projects}
          currentUserId={currentUserId}
        />
      </div>

      <div className="flex-1 overflow-auto -mx-6 px-6 space-y-6">
        {order
          .filter((type) => grouped.has(type))
          .map((type) => {
            const docs = grouped.get(type)!;
            const meta = docTypeMap[type];
            return (
              <section key={type}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-rule">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-base ${meta.tone}`}
                  >
                    {meta.icon}
                  </span>
                  <span className="font-bold text-base tracking-tight">
                    {meta.label}
                  </span>
                  <span className="text-xs text-text-faint tabular font-medium">
                    {docs.length}
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                  {docs.map((d) => (
                    <DocCard
                      key={d.id}
                      doc={d}
                      icon={meta.icon}
                      onClick={() => setSelectedId(d.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

        {documents.length === 0 && (
          <div className="text-center text-text-faint py-16 text-sm">
            還沒有文件 — 點右上「＋ 新文件」開始
          </div>
        )}
      </div>

      <DocumentDetailDialog
        doc={selectedDoc}
        users={users}
        projects={projects}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function DocCard({
  doc,
  icon,
  onClick,
}: {
  doc: ViewDocument;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-surface-2 rounded-xl p-3.5 cursor-pointer transition-all hover:-translate-y-0.5 text-left w-full"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-snug tracking-tight">
            {doc.name}
          </div>
          <div className="text-[11px] text-text-dim mt-1.5 flex items-center gap-1.5 tabular">
            {doc.date && <span>{fmt(doc.date)}</span>}
            {doc.authorName && (
              <>
                <span className="text-text-faint">·</span>
                <span>{doc.authorName}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

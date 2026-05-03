"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  unarchiveTask,
  unarchiveProject,
  unarchiveDocument,
} from "@/server/actions";
import { resolveProjectColor, projectChipStyle } from "@/lib/data";
import type {
  ArchivedTask,
  ArchivedProject,
  ArchivedDocument,
} from "@/server/queries";

const DOC_ICON: Record<string, string> = {
  MEETING: "🗓️",
  RESEARCH: "🔍",
  DEV_NOTE: "🧑‍💻",
  PRODUCT: "📑",
  TEST: "🔦",
  TEAM_GUIDE: "📘",
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "尚未開始",
  DISCUSSING: "待討論",
  ON_HOLD: "擱置",
  IN_PROGRESS: "進行中",
  WAITING_REVIEW: "等待驗收",
  DONE: "已完成",
};

export function ArchiveView({
  tasks,
  projects,
  documents,
}: {
  tasks: ArchivedTask[];
  projects: ArchivedProject[];
  documents: ArchivedDocument[];
}) {
  const total = tasks.length + projects.length + documents.length;

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <h1 className="text-[28px] font-bold tracking-tight">封存區</h1>
        <span className="text-[13px] text-text-dim tabular">
          {total} 筆已封存
        </span>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-sm">
          沒有封存項目 — 任務 / 專案 / 文件被封存後會出現在這裡，可隨時還原。
        </div>
      ) : (
        <div className="flex-1 overflow-auto -mx-6 px-6 space-y-6">
          {projects.length > 0 && (
            <Section title="專案" count={projects.length}>
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </Section>
          )}

          {tasks.length > 0 && (
            <Section title="任務" count={tasks.length}>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </Section>
          )}

          {documents.length > 0 && (
            <Section title="文件" count={documents.length}>
              {documents.map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-rule">
        <span className="font-bold text-base tracking-tight">{title}</span>
        <span className="text-xs text-text-faint tabular font-medium">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function TaskRow({ task }: { task: ArchivedTask }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleRestore = () => {
    startTransition(async () => {
      await unarchiveTask(task.id);
      router.refresh();
    });
  };
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{task.title}</div>
        <div className="text-[11px] text-text-dim mt-0.5 flex gap-2 items-center tabular">
          <span>{STATUS_LABEL[task.status] ?? task.status}</span>
          {task.projectName && (
            <>
              <span className="text-text-faint">·</span>
              <span>{task.projectName}</span>
            </>
          )}
          <span className="text-text-faint">·</span>
          <span>封存於 {fmt(task.archivedAt)}</span>
        </div>
      </div>
      <button
        onClick={handleRestore}
        disabled={isPending}
        className="px-3 py-1.5 bg-blue text-white rounded-md text-xs font-semibold cursor-pointer hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? "還原中..." : "↺ 還原"}
      </button>
    </div>
  );
}

function ProjectRow({ project }: { project: ArchivedProject }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleRestore = () => {
    startTransition(async () => {
      await unarchiveProject(project.id);
      router.refresh();
    });
  };
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3 flex items-center gap-3">
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ background: resolveProjectColor(project.color) }}
      >
        {project.name.charAt(0)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{project.name}</div>
        <div className="text-[11px] text-text-dim mt-0.5 tabular">
          封存於 {fmt(project.archivedAt)}
        </div>
      </div>
      <button
        onClick={handleRestore}
        disabled={isPending}
        className="px-3 py-1.5 bg-blue text-white rounded-md text-xs font-semibold cursor-pointer hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? "還原中..." : "↺ 還原"}
      </button>
    </div>
  );
}

function DocumentRow({ doc }: { doc: ArchivedDocument }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleRestore = () => {
    startTransition(async () => {
      await unarchiveDocument(doc.id);
      router.refresh();
    });
  };
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3 flex items-center gap-3">
      <span className="text-2xl flex-shrink-0">
        {DOC_ICON[doc.docType] ?? "📄"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{doc.name}</div>
        <div className="text-[11px] text-text-dim mt-0.5 tabular">
          封存於 {fmt(doc.archivedAt)}
        </div>
      </div>
      <button
        onClick={handleRestore}
        disabled={isPending}
        className="px-3 py-1.5 bg-blue text-white rounded-md text-xs font-semibold cursor-pointer hover:brightness-95 disabled:opacity-50"
      >
        {isPending ? "還原中..." : "↺ 還原"}
      </button>
    </div>
  );
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

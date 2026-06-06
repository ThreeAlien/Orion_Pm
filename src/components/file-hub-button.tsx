"use client";

// 頂部「檔案總管」：彙整各專案的檔案統籌表連結，用專案 chip 篩選，點 ↗ 直接開。
// 放頂部列 → 任何頁都能邊做事邊開檔案。
import { useState } from "react";
import { getProjectFileHub, type FileHubProject } from "@/server/actions";
import { resolveProjectColor } from "@/lib/data";

export function FileHubButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FileHubProject[] | null>(null);
  const [sel, setSel] = useState<string>(""); // "" = 全部

  function openDialog() {
    setOpen(true);
    setSel("");
    setData(null);
    getProjectFileHub()
      .then(setData)
      .catch(() => setData([]));
  }

  const projects = data ?? [];
  const shown = sel ? projects.filter((p) => p.id === sel) : projects;

  return (
    <>
      <button
        onClick={openDialog}
        aria-label="檔案總管"
        title="檔案總管"
        className="w-9 h-9 rounded-[10px] bg-rule-soft hover:bg-[#EAEAEF] flex items-center justify-center cursor-pointer flex-shrink-0 text-base"
      >
        📎
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[560px] max-w-[92vw] max-h-[82vh] flex flex-col bg-surface rounded-2xl shadow-2xl">
            <div className="px-5 py-3.5 border-b border-rule flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">📎 檔案總管</h2>
              <span className="text-xs text-text-faint">各專案檔案連結</span>
              <div className="flex-1" />
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-md bg-rule-soft hover:bg-rule text-text-dim flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 專案 chip 篩選 */}
            {projects.length > 0 && (
              <div className="px-5 pt-3 flex items-center gap-1.5 flex-wrap">
                <Chip active={!sel} onClick={() => setSel("")}>
                  全部
                </Chip>
                {projects.map((p) => (
                  <Chip
                    key={p.id}
                    active={sel === p.id}
                    dot={resolveProjectColor(p.color)}
                    onClick={() => setSel(p.id)}
                  >
                    {p.name}
                  </Chip>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {data === null ? (
                <div className="text-sm text-text-faint py-6 text-center">
                  載入中…
                </div>
              ) : projects.length === 0 ? (
                <div className="text-sm text-text-faint py-6 text-center">
                  目前沒有專案填了檔案統籌表。到專案編輯裡新增連結後就會出現在這。
                </div>
              ) : (
                shown.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: resolveProjectColor(p.color) }}
                      />
                      <span className="text-sm font-bold">{p.name}</span>
                    </div>
                    <div className="space-y-1 pl-3.5">
                      {p.links.map((l, i) =>
                        l.url ? (
                          <a
                            key={i}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rule-soft text-sm text-blue group"
                          >
                            <span className="flex-1 truncate">{l.label}</span>
                            <span className="text-text-faint group-hover:text-blue">
                              ↗
                            </span>
                          </a>
                        ) : (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-text-faint"
                          >
                            <span className="flex-1 truncate">{l.label}</span>
                            <span className="text-[11px]">（連結未填）</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Chip({
  children,
  active,
  dot,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  dot?: string;
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
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      )}
      {children}
    </button>
  );
}

"use client";

import { useState } from "react";
import { NewTaskDialog } from "./new-task-dialog";
import type { ViewProject, ViewUser } from "@/lib/data";

export function Topbar({
  projects,
  users,
  currentUserId,
  onMobileMenuOpen,
}: {
  projects: ViewProject[];
  users: ViewUser[];
  currentUserId?: string;
  onMobileMenuOpen?: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="bg-surface px-3 sm:px-4 py-2.5 rounded-2xl flex items-center gap-2 sm:gap-3 shadow-soft">
        {onMobileMenuOpen && (
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden w-9 h-9 rounded-[10px] bg-rule-soft flex items-center justify-center text-base cursor-pointer hover:bg-[#EAEAEF] flex-shrink-0"
            title="開啟選單"
            aria-label="開啟選單"
          >
            ☰
          </button>
        )}
        <input
          className="flex-1 min-w-0 sm:max-w-[420px] bg-rule-soft border-0 px-3 sm:px-3.5 py-2 rounded-[10px] text-sm focus:outline-none focus:bg-[#EAEAEF]"
          placeholder="搜尋..."
        />
        <span className="hidden sm:inline-flex text-[11px] text-text-faint bg-surface-3 px-1.5 py-0.5 rounded-md">
          ⌘ K
        </span>
        <div className="hidden md:block flex-1" />
        <button
          onClick={() => setDialogOpen(true)}
          className="bg-blue text-white px-2.5 sm:px-3.5 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer hover:brightness-95 whitespace-nowrap flex-shrink-0"
        >
          <span className="sm:hidden">＋</span>
          <span className="hidden sm:inline">＋ 新任務</span>
        </button>
      </div>
      <NewTaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projects={projects}
        users={users}
        defaultAssigneeId={currentUserId}
      />
    </>
  );
}

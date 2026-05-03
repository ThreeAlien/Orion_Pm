"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveProject } from "@/server/actions";

export function ArchiveProjectButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (
      !confirm(
        `封存「${name}」？\n\n該專案的任務 / 文件不會刪除，但會從列表消失，可在「📦 封存區」還原。`
      )
    )
      return;
    startTransition(async () => {
      await archiveProject(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red/[.08] hover:bg-red/[.16] border border-red/30 text-red text-[11px] font-semibold cursor-pointer disabled:opacity-40 transition-colors"
      title="封存專案（之後可在「📦 封存區」還原）"
      aria-label={`封存 ${name}`}
    >
      {pending ? "封存中…" : "封存"}
    </button>
  );
}

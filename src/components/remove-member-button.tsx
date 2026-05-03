"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { removeMember } from "@/server/actions";

export function RemoveMemberButton({
  memberId,
  memberName,
  isSelf,
  currentUserId,
  ownedProjects,
}: {
  memberId: string;
  memberName: string;
  isSelf: boolean;
  currentUserId: string | undefined;
  ownedProjects: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) {
    return (
      <span
        className="text-[10px] text-text-faint italic"
        title="登入身份不能移除自己"
      >
        （你自己）
      </span>
    );
  }

  function handleClick() {
    if (!currentUserId) {
      setError("無法取得登入身份");
      return;
    }
    const warn =
      ownedProjects > 0
        ? `\n\n⚠️ 該成員擁有 ${ownedProjects} 個專案，移除後專案 owner 會轉給你。`
        : "";
    if (
      !confirm(
        `移除成員「${memberName}」？${warn}\n\n他被指派的任務 / 寫的文件會保留但 assignee / author 設成空。\n\n此動作不可還原。`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await removeMember(memberId, currentUserId);
      if (!result.ok) {
        setError(result.error ?? "移除失敗");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-[11px] px-2 py-1 rounded-md text-text-faint hover:text-red hover:bg-red/[.08] cursor-pointer disabled:opacity-40 transition-colors"
        title={`移除 ${memberName}`}
      >
        {pending ? "移除中..." : "移除"}
      </button>
      {error && (
        <div className="text-[10px] text-red mt-1">{error}</div>
      )}
    </>
  );
}

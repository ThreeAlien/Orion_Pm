// 一次性 cleanup：
// 1. 舊 description（[來源] Orion QA Bug #xxx + markdown）→ 新短連結
// 2. 所有 QA 同步來的卡（description 含 orion-qa.vercel.app 或舊「Orion QA Bug」）統一掛到「CMS 網站模組」專案

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkBearer } from "@/lib/external-auth";

const QA_PROJECT_NAME = "CMS 網站模組";

export async function POST(request: Request) {
  const auth = checkBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const project = await db.project.findFirst({
    where: { name: QA_PROJECT_NAME, archived: false },
    select: { id: true },
  });
  const projectId = project?.id ?? null;

  // 凡 description 含 QA 標記或 orion-qa link 都納入清理
  const tasks = await db.task.findMany({
    where: {
      OR: [
        { description: { contains: "[來源] Orion QA Bug #" } },
        { description: { contains: "orion-qa.vercel.app/bugs/" } },
      ],
    },
    select: { id: true, description: true, title: true, projectId: true },
  });

  let descRewritten = 0;
  let projectAssigned = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const task of tasks) {
    // 從 description 抽出 bug id（不論新舊格式）
    const m = task.description?.match(/bugs\/([a-f0-9-]{36})|Orion QA Bug #([a-f0-9-]{36})/i);
    const bugId = m?.[1] || m?.[2];
    if (!bugId) {
      skipped.push({ id: task.id, reason: "找不到 bug id" });
      continue;
    }

    const newDesc = `🔗 來源：https://orion-qa.vercel.app/bugs/${bugId}`;
    const needDescUpdate = task.description !== newDesc;
    const needProjectUpdate = projectId && task.projectId !== projectId;

    if (!needDescUpdate && !needProjectUpdate) continue;

    await db.task.update({
      where: { id: task.id },
      data: {
        ...(needDescUpdate ? { description: newDesc } : {}),
        ...(needProjectUpdate ? { projectId } : {}),
      },
    });
    if (needDescUpdate) descRewritten++;
    if (needProjectUpdate) projectAssigned++;
  }

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({
    ok: true,
    scanned: tasks.length,
    descRewritten,
    projectAssigned,
    targetProjectFound: !!projectId,
    skipped,
  });
}

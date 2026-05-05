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

  // 凡 description 含 QA 標記或 orion-qa link 都納入清理（含 archived 也帶進來重整）
  const tasks = await db.task.findMany({
    where: {
      OR: [
        { description: { contains: "[來源] Orion QA Bug #" } },
        { description: { contains: "orion-qa.vercel.app/bugs/" } },
      ],
    },
    select: {
      id: true,
      description: true,
      title: true,
      projectId: true,
      archived: true,
      createdAt: true,
    },
  });

  // group by bug id（從 description 抽 uuid）
  const groups: Record<string, typeof tasks> = {};
  const skipped: { id: string; reason: string }[] = [];
  for (const t of tasks) {
    const m = t.description?.match(
      /bugs\/([a-f0-9-]{36})|Orion QA Bug #([a-f0-9-]{36})/i
    );
    const bugId = m?.[1] || m?.[2];
    if (!bugId) {
      skipped.push({ id: t.id, reason: "找不到 bug id" });
      continue;
    }
    (groups[bugId] ||= []).push(t);
  }

  let descRewritten = 0;
  let projectAssigned = 0;
  let dedupArchived = 0;
  const keepIds: string[] = [];

  for (const [bugId, group] of Object.entries(groups)) {
    // 同 bug id 多張 → keep 最早建的（id 最舊 = 通常 backfill 第一次 POST 那張），其他 archive
    group.sort((a, b) => +a.createdAt - +b.createdAt);
    const [keep, ...dups] = group;
    keepIds.push(keep.id);

    const newDesc = `🔗 來源：https://orion-qa.vercel.app/bugs/${bugId}`;
    const needDesc = keep.description !== newDesc;
    const needProject = projectId && keep.projectId !== projectId;
    const needUnarchive = keep.archived === true;

    if (needDesc || needProject || needUnarchive) {
      await db.task.update({
        where: { id: keep.id },
        data: {
          ...(needDesc ? { description: newDesc } : {}),
          ...(needProject ? { projectId } : {}),
          ...(needUnarchive ? { archived: false } : {}),
        },
      });
      if (needDesc) descRewritten++;
      if (needProject) projectAssigned++;
    }

    // archive 重複的
    for (const dup of dups) {
      if (!dup.archived) {
        await db.task.update({
          where: { id: dup.id },
          data: { archived: true },
        });
        dedupArchived++;
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/archive");

  return NextResponse.json({
    ok: true,
    scanned: tasks.length,
    uniqueBugs: Object.keys(groups).length,
    keptTaskIds: keepIds,
    descRewritten,
    projectAssigned,
    dedupArchived,
    targetProjectFound: !!projectId,
    skipped,
  });
}

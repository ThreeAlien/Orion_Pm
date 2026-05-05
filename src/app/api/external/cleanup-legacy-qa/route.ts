// 一次性 cleanup：把所有舊格式 description（[來源] Orion QA Bug #xxx + 整段 markdown）
// 替換為新格式（🔗 來源：https://orion-qa.vercel.app/bugs/<id> 一行）。
// 跑完應該所有 QA 同步來的卡都統一短描述。

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkBearer } from "@/lib/external-auth";

export async function POST(request: Request) {
  const auth = checkBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const tasks = await db.task.findMany({
    where: { description: { contains: "[來源] Orion QA Bug #" } },
    select: { id: true, description: true, title: true },
  });

  let updated = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const task of tasks) {
    const m = task.description?.match(
      /Orion QA Bug #([a-f0-9-]{36})/i
    );
    if (!m) {
      skipped.push({ id: task.id, reason: "找不到 bug id" });
      continue;
    }
    const bugId = m[1];
    const newDesc = `🔗 來源：https://orion-qa.vercel.app/bugs/${bugId}`;
    await db.task.update({
      where: { id: task.id },
      data: { description: newDesc },
    });
    updated++;
  }

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({
    ok: true,
    scanned: tasks.length,
    updated,
    skipped,
  });
}

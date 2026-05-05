// 外部系統改 PM 任務卡的 assignee（單向 sync）。
// 認證：Authorization: Bearer <EXTERNAL_API_KEY>
// Body: { assigneeEmail: string | null }   // null = 拔掉處理人
// 回傳：200 { ok: true } / 400 / 401 / 404

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { checkBearer, resolveAssigneeId } from "@/lib/external-auth";

const Body = z.object({
  assigneeEmail: z.email().nullable(),
  status: z
    .enum([
      "TODO",
      "DISCUSSING",
      "ON_HOLD",
      "IN_PROGRESS",
      "WAITING_REVIEW",
      "DONE",
    ])
    .optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = checkBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" },
      { status: 400 }
    );
  }

  const task = await db.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json(
      { ok: false, error: "找不到該任務卡" },
      { status: 404 }
    );
  }

  const assigneeId = await resolveAssigneeId(parsed.data.assigneeEmail);

  await db.task.update({
    where: { id },
    data: {
      assigneeId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({ ok: true });
}

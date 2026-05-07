// 外部系統改 PM 任務卡（單向 sync）。
// 認證：Authorization: Bearer <EXTERNAL_API_KEY>
// Body 各欄位皆可選：
//   - assigneeEmail: string | null   // null = 拔掉處理人
//   - status: TaskStatus
//   - description: string | null
//   - archived: boolean              // QA 端封存 / 還原 bug 時帶過來
// 回傳：200 { ok: true } / 400 / 401 / 404

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { checkBearer, resolveAssigneeId } from "@/lib/external-auth";

const Body = z.object({
  assigneeEmail: z.email().nullable().optional(),
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
  description: z.string().max(2000).optional().nullable(),
  archived: z.boolean().optional(),
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

  // assigneeEmail undefined = 不動；null = 拔掉；string = 解析成 id
  const data: Record<string, unknown> = {};
  if (parsed.data.assigneeEmail !== undefined) {
    data.assigneeId = await resolveAssigneeId(parsed.data.assigneeEmail);
  }
  if (parsed.data.status) {
    data.status = parsed.data.status;
  }
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description?.trim() || null;
  }
  if (parsed.data.archived !== undefined) {
    data.archived = parsed.data.archived;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.task.update({
    where: { id },
    data,
  });

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({ ok: true });
}

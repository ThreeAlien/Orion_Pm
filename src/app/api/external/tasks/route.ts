// 外部系統建立 PM 任務卡（如 Orion QA 進「待驗收」時呼叫）。
// 認證：Authorization: Bearer <EXTERNAL_API_KEY>
// Body: { title, description?, assigneeEmail?, priority?, sourceRef? }
// 回傳：201 { ok: true, id } / 400 / 401 / 404

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { checkBearer } from "@/lib/external-auth";

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  assigneeEmail: z.email().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  sourceRef: z.string().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = checkBearer(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "驗證失敗" },
      { status: 400 }
    );
  }
  const data = parsed.data;

  let assigneeId: string | null = null;
  if (data.assigneeEmail) {
    const user = await db.user.findUnique({
      where: { email: data.assigneeEmail },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: `查無此 user: ${data.assigneeEmail}` },
        { status: 404 }
      );
    }
    assigneeId = user.id;
  }

  // 來源標記塞 description prefix（之後在 PM 卡片可看到「[來源] ...」）
  const composedDescription =
    [
      data.sourceRef ? `[來源] ${data.sourceRef}` : null,
      data.description?.trim() || null,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  // 算 position：放 TODO 列最末（跟 createTask server action 一致）
  const last = await db.task.findFirst({
    where: { status: "TODO", archived: false },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? 0) + 1024;

  const task = await db.task.create({
    data: {
      title: data.title,
      description: composedDescription,
      status: "TODO",
      priority: data.priority ?? "MEDIUM",
      assigneeId,
      position: nextPosition,
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");

  return NextResponse.json({ ok: true, id: task.id }, { status: 201 });
}

// Neon keepalive — Vercel cron 每 4 分鐘 ping 一次，
// 防止 Neon free tier compute 閒置 5 分鐘自動 suspend 造成冷啟動。
// 公開 endpoint，但只回 ok / fail 不洩漏資料。
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

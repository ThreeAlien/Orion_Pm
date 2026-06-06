// 讀取貼圖：回傳 Image 表的 webp 二進位。內容用 immutable 長快取（id 內容不變）。
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const img = await db.image.findUnique({
    where: { id },
    select: { mime: true, bytes: true },
  });
  if (!img) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(Buffer.from(img.bytes), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

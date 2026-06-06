// 富文本貼圖上傳：前端把圖壓成 webp 後 POST 二進位進來，存 DB（Image 表）。
// 回傳 { url: "/api/images/{id}" }，HTML 內只放這個短網址、不塞 base64。
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 需要 Buffer
export const dynamic = "force-dynamic";

// 壓過的 webp 截圖通常 < 1MB；放寬到 5MB 擋掉異常大檔
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!/^image\/(webp|png|jpeg)/.test(contentType)) {
    return NextResponse.json({ error: "只接受圖片" }, { status: 415 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "空檔案" }, { status: 400 });
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "圖片過大" }, { status: 413 });
  }

  const img = await db.image.create({
    data: {
      mime: contentType.split(";")[0],
      bytes: buf,
      uploaderId: session.user.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ url: `/api/images/${img.id}` });
}

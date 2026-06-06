-- 富文本貼圖 DB-backed 儲存（webp）
-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" BYTEA NOT NULL,
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Image_createdAt_idx" ON "Image"("createdAt");

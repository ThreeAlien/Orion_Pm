-- 專案加客戶資訊欄位
ALTER TABLE "Project" ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "taxId" TEXT;

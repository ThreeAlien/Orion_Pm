-- 專案檔案統籌表（連結清單 JSON）
ALTER TABLE "Project" ADD COLUMN     "fileLinks" JSONB NOT NULL DEFAULT '[]';

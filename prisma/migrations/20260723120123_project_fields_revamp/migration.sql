-- 專案欄位改造
--   1. 狀態 ProjectStatus 換 3 態，舊值以 CASE 安全映射（不丟資料）：
--        PLANNING, PAUSED  -> DEVELOPING（開發）
--        IN_PROGRESS       -> SIGNED（已簽約執行）
--        DONE              -> CLOSED（結案）
--   2. category 單值 String -> 多值 String[]（保留既有值包成陣列；NULL/空 -> 空陣列）
--   3. 新增 attribute（案件屬性）、source（案件來源）兩欄
-- 對應到 prod 時同一份腳本會把既有專案的舊狀態值一併轉換。

-- AlterEnum: ProjectStatus 換 3 態
BEGIN;
CREATE TYPE "ProjectStatus_new" AS ENUM ('DEVELOPING', 'SIGNED', 'CLOSED');
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING (
  CASE "status"::text
    WHEN 'PLANNING'    THEN 'DEVELOPING'
    WHEN 'PAUSED'      THEN 'DEVELOPING'
    WHEN 'IN_PROGRESS' THEN 'SIGNED'
    WHEN 'DONE'        THEN 'CLOSED'
    ELSE 'DEVELOPING'
  END::"ProjectStatus_new"
);
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
DROP TYPE "ProjectStatus_old";
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'DEVELOPING';
COMMIT;

-- AlterTable: category 單值 -> 多值（保留既有值）
ALTER TABLE "Project" ALTER COLUMN "category" TYPE TEXT[] USING (
  CASE WHEN "category" IS NULL OR "category" = '' THEN ARRAY[]::TEXT[] ELSE ARRAY["category"] END
);
ALTER TABLE "Project" ALTER COLUMN "category" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable: 新增案件屬性 / 案件來源
ALTER TABLE "Project" ADD COLUMN "attribute" TEXT;
ALTER TABLE "Project" ADD COLUMN "source" TEXT;

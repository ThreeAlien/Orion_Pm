-- 任務新增「客戶需求品項」單選欄位
--   碼同 Project.category（app 層管選項，label 在 data.ts）
--   值須為所屬專案已選品項之一；無專案則不填（nullable）
ALTER TABLE "Task" ADD COLUMN "category" TEXT;

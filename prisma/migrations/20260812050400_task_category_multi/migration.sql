-- Task.category：單值（TEXT）→ 多值（TEXT[]）。既有資料原地轉成單元素陣列，不遺失。
ALTER TABLE "Task" ADD COLUMN "category_arr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Task"
SET "category_arr" = ARRAY["category"]
WHERE "category" IS NOT NULL AND "category" <> '';

ALTER TABLE "Task" DROP COLUMN "category";
ALTER TABLE "Task" RENAME COLUMN "category_arr" TO "category";

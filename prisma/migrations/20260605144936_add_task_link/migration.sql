
-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskLink_linkedId_idx" ON "TaskLink"("linkedId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLink_taskId_linkedId_key" ON "TaskLink"("taskId", "linkedId");

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_linkedId_fkey" FOREIGN KEY ("linkedId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

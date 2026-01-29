/*
  Warnings:

  - A unique constraint covering the columns `[userId,assignmentId,attemptNo]` on the table `StudentAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "StudentAssignment_userId_assignmentId_key";

-- AlterTable
ALTER TABLE "StudentAssignment" ADD COLUMN     "attemptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "StudentAssignment_userId_assignmentId_idx" ON "StudentAssignment"("userId", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAssignment_userId_assignmentId_attemptNo_key" ON "StudentAssignment"("userId", "assignmentId", "attemptNo");

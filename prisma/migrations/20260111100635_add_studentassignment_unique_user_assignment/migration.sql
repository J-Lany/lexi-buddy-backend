/*
  Warnings:

  - A unique constraint covering the columns `[userId,assignmentId]` on the table `StudentAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "StudentAssignment_userId_idx" ON "StudentAssignment"("userId");

-- CreateIndex
CREATE INDEX "StudentAssignment_assignmentId_idx" ON "StudentAssignment"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAssignment_userId_assignmentId_key" ON "StudentAssignment"("userId", "assignmentId");

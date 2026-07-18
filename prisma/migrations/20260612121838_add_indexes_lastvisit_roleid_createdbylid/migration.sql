-- CreateIndex
CREATE INDEX "Lesson_createdById_idx" ON "Lesson"("createdById");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_lastVisit_idx" ON "User"("lastVisit");

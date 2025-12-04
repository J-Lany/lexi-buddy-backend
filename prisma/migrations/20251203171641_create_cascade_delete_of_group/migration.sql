-- DropForeignKey
ALTER TABLE "StudentInGroup" DROP CONSTRAINT "StudentInGroup_groupId_fkey";

-- AddForeignKey
ALTER TABLE "StudentInGroup" ADD CONSTRAINT "StudentInGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

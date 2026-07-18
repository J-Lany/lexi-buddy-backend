-- DropForeignKey
ALTER TABLE "Result" DROP CONSTRAINT "Result_questionId_fkey";

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssignmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" INTEGER;

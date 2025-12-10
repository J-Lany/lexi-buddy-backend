/*
  Warnings:

  - You are about to drop the column `dateOfBirth` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('UNDER_18', 'BETWEEN_18_35', 'OVER_35');

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "dateOfBirth",
ADD COLUMN     "ageGroup" "AgeGroup";

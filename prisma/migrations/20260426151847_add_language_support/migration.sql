-- CreateEnum
CREATE TYPE "Language" AS ENUM ('english', 'spanish', 'french', 'german', 'italian', 'chinese', 'japanese', 'korean', 'turkish', 'kazakh', 'russian');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'english';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultLanguage" "Language" NOT NULL DEFAULT 'english';

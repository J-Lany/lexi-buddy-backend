-- CreateEnum
CREATE TYPE "InstructionLanguage" AS ENUM ('native', 'target');

-- Add new columns with temporary nullable to allow data migration
ALTER TABLE "Lesson" ADD COLUMN "targetLanguage" "Language";
ALTER TABLE "Lesson" ADD COLUMN "nativeLanguage" "Language" NOT NULL DEFAULT 'russian';
ALTER TABLE "Lesson" ADD COLUMN "instructionLanguage" "InstructionLanguage" NOT NULL DEFAULT 'native';

-- Migrate existing language data to targetLanguage
UPDATE "Lesson" SET "targetLanguage" = "language";

-- Set NOT NULL and default now that data is migrated
ALTER TABLE "Lesson" ALTER COLUMN "targetLanguage" SET NOT NULL;
ALTER TABLE "Lesson" ALTER COLUMN "targetLanguage" SET DEFAULT 'english';

-- Drop old language column
ALTER TABLE "Lesson" DROP COLUMN "language";

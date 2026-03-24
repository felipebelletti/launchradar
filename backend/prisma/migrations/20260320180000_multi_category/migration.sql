-- AlterTable: add new columns
ALTER TABLE "LaunchRecord" ADD COLUMN "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LaunchRecord" ADD COLUMN "primaryCategory" TEXT;

-- Migrate existing data
UPDATE "LaunchRecord"
SET "categories" = ARRAY["category"], "primaryCategory" = "category"
WHERE "category" IS NOT NULL;

-- Drop old column
ALTER TABLE "LaunchRecord" DROP COLUMN "category";

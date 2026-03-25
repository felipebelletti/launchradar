-- CreateEnum
CREATE TYPE "PlatformSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "LaunchRecord" ADD COLUMN     "platform" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PlatformSuggestion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchRecordIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PlatformSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSuggestion_name_key" ON "PlatformSuggestion"("name");

-- Backfill: copy existing chain values into platform/platforms
UPDATE "LaunchRecord"
SET "platform" = "chain",
    "platforms" = CASE WHEN "chain" IS NOT NULL THEN ARRAY["chain"] ELSE ARRAY[]::TEXT[] END
WHERE "chain" IS NOT NULL AND "platform" IS NULL;

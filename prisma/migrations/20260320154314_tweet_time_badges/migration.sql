-- CreateEnum
CREATE TYPE "IngestTiming" AS ENUM ('FUTURE', 'LIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TweetTimeBadge" AS ENUM ('LIVE_NOW', 'NEXT_HOUR', 'TODAY', 'THIS_WEEK', 'LATER', 'IN_N_DAYS', 'UPCOMING', 'TIME_UNKNOWN', 'RESCHEDULED', 'NO_DATE');

-- AlterTable
ALTER TABLE "TweetSignal" ADD COLUMN     "ingestTiming" "IngestTiming",
ADD COLUMN     "timeBadge" "TweetTimeBadge",
ADD COLUMN     "timeBadgeDetail" INTEGER;

-- CreateEnum
CREATE TYPE "LaunchStatus" AS ENUM ('STUB', 'PARTIAL', 'CONFIRMED', 'VERIFIED', 'STALE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TWEET', 'PROFILE', 'WEBSITE', 'MANUAL', 'IMAGE_OCR');

-- CreateEnum
CREATE TYPE "RuleSource" AS ENUM ('TIER_A', 'TIER_B', 'TIER_C');

-- CreateTable
CREATE TABLE "LaunchRecord" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "ticker" TEXT,
    "launchDate" TIMESTAMP(3),
    "launchDateRaw" TEXT,
    "launchDateConfidence" DOUBLE PRECISION,
    "launchType" TEXT,
    "chain" TEXT,
    "category" TEXT,
    "website" TEXT,
    "whitepaper" TEXT,
    "twitterHandle" TEXT,
    "twitterFollowers" INTEGER,
    "isVerifiedAccount" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "LaunchStatus" NOT NULL DEFAULT 'STUB',
    "ruleSource" "RuleSource" NOT NULL DEFAULT 'TIER_B',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),

    CONSTRAINT "LaunchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TweetSignal" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageOcrText" TEXT,
    "authorHandle" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "retweets" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchRecordId" TEXT,

    CONSTRAINT "TweetSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchSource" (
    "id" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "rawContent" TEXT,
    "extractedData" JSONB,
    "launchRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredAccount" (
    "id" TEXT NOT NULL,
    "twitterHandle" TEXT NOT NULL,
    "twitterId" TEXT,
    "webhookRuleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "queued" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "lastTweetAt" TIMESTAMP(3),
    "launchRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TweetSignal_tweetId_key" ON "TweetSignal"("tweetId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredAccount_twitterHandle_key" ON "MonitoredAccount"("twitterHandle");

-- AddForeignKey
ALTER TABLE "TweetSignal" ADD CONSTRAINT "TweetSignal_launchRecordId_fkey" FOREIGN KEY ("launchRecordId") REFERENCES "LaunchRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchSource" ADD CONSTRAINT "LaunchSource_launchRecordId_fkey" FOREIGN KEY ("launchRecordId") REFERENCES "LaunchRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

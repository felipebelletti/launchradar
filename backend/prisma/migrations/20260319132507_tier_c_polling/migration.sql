/*
  Warnings:

  - You are about to drop the column `queued` on the `MonitoredAccount` table. All the data in the column will be lost.
  - You are about to drop the column `webhookRuleId` on the `MonitoredAccount` table. All the data in the column will be lost.
  - Made the column `activatedAt` on table `MonitoredAccount` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "MonitoredAccount" DROP COLUMN "queued",
DROP COLUMN "webhookRuleId",
ADD COLUMN     "lastPollAt" TIMESTAMP(3),
ALTER COLUMN "active" SET DEFAULT true,
ALTER COLUMN "activatedAt" SET NOT NULL,
ALTER COLUMN "activatedAt" SET DEFAULT CURRENT_TIMESTAMP;

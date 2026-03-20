-- AlterTable
ALTER TABLE "LaunchRecord" ADD COLUMN     "previousLaunchDate" TIMESTAMP(3),
ADD COLUMN     "rescheduledAt" TIMESTAMP(3);

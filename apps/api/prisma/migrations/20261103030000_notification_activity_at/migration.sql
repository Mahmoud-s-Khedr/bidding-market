ALTER TABLE "Notification" ADD COLUMN "activityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Notification" SET "activityAt" = "createdAt";
DROP INDEX "Notification_userId_readAt_createdAt_idx";
CREATE INDEX "Notification_userId_readAt_activityAt_idx" ON "Notification"("userId", "readAt", "activityAt");

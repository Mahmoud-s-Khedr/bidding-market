ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "conversationId" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Conversation" SET "lastMessageAt" = "createdAt" WHERE "lastMessageAt" IS NULL;
ALTER TABLE "Conversation" ALTER COLUMN "lastMessageAt" SET NOT NULL;

UPDATE "Notification"
SET "conversationId" = "data"->>'conversationId'
WHERE "type" = 'MESSAGE_RECEIVED' AND "data" ? 'conversationId';

CREATE INDEX IF NOT EXISTS "Notification_userId_conversationId_idx" ON "Notification"("userId", "conversationId");
DELETE FROM "Notification" older
USING "Notification" newer
WHERE older."type" = 'MESSAGE_RECEIVED' AND newer."type" = 'MESSAGE_RECEIVED'
  AND older."readAt" IS NULL AND newer."readAt" IS NULL
  AND older."conversationId" = newer."conversationId" AND older."userId" = newer."userId"
  AND (older."createdAt", older.id) < (newer."createdAt", newer.id);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_unread_message_conversation_unique"
ON "Notification"("userId", "conversationId")
WHERE "type" = 'MESSAGE_RECEIVED' AND "readAt" IS NULL AND "conversationId" IS NOT NULL;

DELETE FROM "MessageAttachment" older
USING "MessageAttachment" newer
WHERE older."uploadId" = newer."uploadId" AND older.id < newer.id;
CREATE UNIQUE INDEX IF NOT EXISTS "MessageAttachment_uploadId_key" ON "MessageAttachment"("uploadId");

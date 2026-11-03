-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "listingDedupKey" TEXT,
ADD COLUMN     "participantPairKey" TEXT;

UPDATE "Conversation" c
SET "listingDedupKey" = COALESCE(c."listingId", '__none__'),
    "participantPairKey" = (
      SELECT string_agg(cp."userId", ':' ORDER BY cp."userId")
      FROM "ConversationParticipant" cp WHERE cp."conversationId" = c.id
    ),
    "lastMessageAt" = COALESCE((SELECT max(m."createdAt") FROM "Message" m WHERE m."conversationId" = c.id), c."createdAt");

ALTER TABLE "Conversation" ALTER COLUMN "listingDedupKey" SET NOT NULL,
ALTER COLUMN "participantPairKey" SET NOT NULL,
ALTER COLUMN "lastMessageAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_participantPairKey_listingDedupKey_key" ON "Conversation"("participantPairKey", "listingDedupKey");


-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "listingDedupKey" TEXT NOT NULL,
ADD COLUMN     "participantPairKey" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_participantPairKey_listingDedupKey_key" ON "Conversation"("participantPairKey", "listingDedupKey");


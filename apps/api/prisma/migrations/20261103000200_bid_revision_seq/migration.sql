-- AlterTable
ALTER TABLE "BidRevision" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "BidRevision_bidId_seq_idx" ON "BidRevision"("bidId", "seq");

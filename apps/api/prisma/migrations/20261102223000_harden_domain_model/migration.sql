-- Domain fields required by moderation, disputes, and agreement lifecycle.
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'AGREEMENT';
ALTER TABLE "User" ADD COLUMN "suspendedReason" TEXT, ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "removedReason" TEXT, ADD COLUMN "removedAt" TIMESTAMP(3), ADD COLUMN "previousStatus" "ListingStatus";
ALTER TABLE "Bid" ADD COLUMN "rejectReason" TEXT, ADD COLUMN "lastCounterById" TEXT;
ALTER TABLE "Agreement" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelledById" TEXT, ADD COLUMN "cancelReason" TEXT, ADD COLUMN "disputeReason" TEXT, ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Report" ADD COLUMN "resolution" TEXT;
CREATE INDEX "Listing_status_kind_location_idx" ON "Listing"("status", "kind", "location");
CREATE INDEX "Listing_status_priceMinCents_idx" ON "Listing"("status", "priceMinCents");
CREATE INDEX "Listing_status_expiresAt_idx" ON "Listing"("status", "expiresAt");
CREATE INDEX "Milestone_agreementId_idx" ON "Milestone"("agreementId");
CREATE INDEX "Deliverable_agreementId_idx" ON "Deliverable"("agreementId");

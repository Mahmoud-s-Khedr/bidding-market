-- Complete the domain links so lifecycle and moderation records cannot dangle.
CREATE TYPE "ReportResolution" AS ENUM ('DISMISS', 'REMOVE_CONTENT', 'SUSPEND_USER');
CREATE TYPE "AgreementEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'MILESTONE_CREATED', 'MILESTONE_UPDATED', 'DELIVERABLE_SUBMITTED', 'DELIVERABLE_ACCEPTED', 'REVISION_REQUESTED', 'CANCELLED', 'DISPUTED', 'COMPLETED');

ALTER TABLE "Report" ALTER COLUMN "resolution" TYPE "ReportResolution" USING "resolution"::"ReportResolution";
ALTER TABLE "AgreementEvent" ALTER COLUMN "type" TYPE "AgreementEventType" USING "type"::"AgreementEventType";
DROP INDEX "Agreement_listingId_key";

ALTER TABLE "BidRevision"
  ADD CONSTRAINT "BidRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deliverable"
  ADD CONSTRAINT "Deliverable_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement"
  ADD CONSTRAINT "Agreement_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgreementEvent"
  ADD CONSTRAINT "AgreementEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

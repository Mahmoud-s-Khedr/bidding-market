-- Enforce at most one active bid (PENDING, SHORTLISTED, COUNTERED) per user per listing.
CREATE UNIQUE INDEX "bid_listing_bidder_active_idx" ON "Bid" ("listingId", "bidderId")
WHERE "status" IN ('PENDING', 'SHORTLISTED', 'COUNTERED');

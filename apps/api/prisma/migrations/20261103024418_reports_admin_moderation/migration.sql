-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Message_deletedAt_idx" ON "Message"("deletedAt");

-- At most one unresolved report by a reporter may exist for a target.
CREATE UNIQUE INDEX "Report_reporter_target_open_key"
ON "Report"("reporterId", "targetType", "targetId")
WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

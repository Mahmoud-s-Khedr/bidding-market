-- uploadId is already unique, so this composite constraint is redundant.
DROP INDEX "DeliverableAttachment_deliverableId_uploadId_key";

import * as React from 'react';
import {
  Package,
  UploadCloud,
  CheckCircle2,
  RotateCcw,
  FileText,
  Download,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { FileDropzone } from '@/components/ui/file-dropzone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatFileSize } from '@/lib/format';
import { safeMediaUrl } from '@/lib/safe-url';
import {
  useSubmitDeliverable,
  useAcceptDeliverable,
  useRequestRevision,
} from '@/lib/api/agreements';
import { ApiError } from '@/lib/api/client';
import type { Attachment } from '@/lib/api/types';
import type { AgreementDetail, DeliverableResponse } from '@market/shared';

interface AgreementDeliverablesProps {
  agreement: AgreementDetail;
  viewerId?: string;
  onRefetch?: () => void;
}

export function AgreementDeliverables({
  agreement,
  viewerId,
  onRefetch,
}: AgreementDeliverablesProps) {
  const isBuyer = agreement.myRole === 'buyer' || agreement.buyer.id === viewerId;
  const isProvider = agreement.myRole === 'provider' || agreement.provider.id === viewerId;
  const isActionable = agreement.status === 'ACTIVE' || agreement.status === 'DELIVERED';

  const submitMutation = useSubmitDeliverable(agreement.id, { viewerId });
  const acceptMutation = useAcceptDeliverable(agreement.id, { viewerId });
  const revisionMutation = useRequestRevision(agreement.id, { viewerId });

  // Submission state
  const [deliverableNote, setDeliverableNote] = React.useState('');
  const [uploadedAttachments, setUploadedAttachments] = React.useState<Attachment[]>([]);
  const [inFlightUploads, setInFlightUploads] = React.useState(0);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Revision modal state
  const [revisionDialogOpen, setRevisionDialogOpen] = React.useState(false);
  const [selectedDeliverableId, setSelectedDeliverableId] = React.useState<string | null>(null);
  const [revisionNote, setRevisionNote] = React.useState('');
  const [revisionError, setRevisionError] = React.useState<string | null>(null);

  const deliverables: DeliverableResponse[] = agreement.deliverables ?? [];

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedNote = deliverableNote.trim();
    if (!trimmedNote) {
      setSubmitError('Please provide a note describing your deliverable.');
      return;
    }
    if (trimmedNote.length > 5000) {
      setSubmitError('Note cannot exceed 5000 characters.');
      return;
    }
    if (uploadedAttachments.length === 0) {
      setSubmitError('Please upload at least one deliverable file.');
      return;
    }
    if (inFlightUploads > 0) {
      setSubmitError('Please wait for file uploads to complete.');
      return;
    }

    try {
      await submitMutation.mutateAsync({
        note: trimmedNote,
        attachmentIds: uploadedAttachments.map((a) => a.id),
      });
      toast.success(
        'Deliverable submitted',
        'Your work has been submitted to the buyer for review.',
      );
      setDeliverableNote('');
      setUploadedAttachments([]);
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Could not submit deliverable', err.message);
      } else {
        toast.error('Could not submit deliverable', 'An unexpected error occurred.');
      }
      onRefetch?.();
    }
  };

  const handleAccept = async (deliverableId: string) => {
    try {
      await acceptMutation.mutateAsync(deliverableId);
      toast.success(
        'Deliverable accepted',
        'You have accepted this deliverable. You can now mark the agreement complete.',
      );
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Could not accept deliverable', err.message);
      } else {
        toast.error('Could not accept deliverable', 'An unexpected error occurred.');
      }
      onRefetch?.();
    }
  };

  const handleRequestRevision = async () => {
    if (!selectedDeliverableId) return;
    const trimmed = revisionNote.trim();
    if (!trimmed) {
      setRevisionError('Please explain what revisions are required.');
      return;
    }
    if (trimmed.length > 5000) {
      setRevisionError('Revision note cannot exceed 5000 characters.');
      return;
    }

    try {
      await revisionMutation.mutateAsync({
        deliverableId: selectedDeliverableId,
        data: { note: trimmed },
      });
      toast.success('Revision requested', 'The provider has been notified of your feedback.');
      setRevisionDialogOpen(false);
      setSelectedDeliverableId(null);
      setRevisionNote('');
      setRevisionError(null);
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Could not request revision', err.message);
      } else {
        toast.error('Could not request revision', 'An unexpected error occurred.');
      }
      onRefetch?.();
    }
  };

  return (
    <Card className="p-6 mb-6 shadow-xs border-border/80">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">Deliverables & Submissions</h2>
        <p className="text-xs text-muted-foreground">
          Files, final work, and revisions exchanged between provider and buyer.
        </p>
      </div>

      {/* Provider Submission Form */}
      {isProvider && isActionable && (
        <form
          onSubmit={(e) => {
            void handleSubmitDeliverable(e);
          }}
          className="mb-6 p-4 rounded-lg bg-muted/30 border border-border space-y-4"
          aria-label="Submit a new deliverable"
        >
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Submit Work / Deliverable</h3>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deliverable-note" className="text-xs">
              Delivery Note *
            </Label>
            <Textarea
              id="deliverable-note"
              value={deliverableNote}
              onChange={(e) => {
                setDeliverableNote(e.target.value);
                setSubmitError(null);
              }}
              placeholder="Describe the completed work, links, or instructions..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Attachments * (PDF, text, ZIP)</Label>
            <FileDropzone
              purpose="DELIVERABLE"
              value={uploadedAttachments}
              onChange={setUploadedAttachments}
              onUploadStateChange={({ inFlightCount }) => setInFlightUploads(inFlightCount)}
              maxFiles={5}
              accept=".pdf,.txt,.zip"
            />
          </div>

          {submitError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {submitError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              isLoading={submitMutation.isPending || inFlightUploads > 0}
            >
              Submit Deliverable
            </Button>
          </div>
        </form>
      )}

      {/* Deliverables List */}
      {deliverables.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground text-xs">
          No deliverables submitted yet.
        </div>
      ) : (
        <div className="space-y-4">
          {deliverables.map((deliv, index) => {
            const isAccepted = Boolean(deliv.acceptedAt);
            const hasRevision = Boolean(deliv.revisionNote && !deliv.acceptedAt);

            return (
              <div
                key={deliv.id}
                className="p-4 rounded-lg border border-border/80 bg-card space-y-3"
              >
                {/* Deliverable Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm text-foreground">
                      Submission #{index + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      • {formatDate(deliv.createdAt)}
                    </span>
                  </div>

                  <div>
                    {isAccepted ? (
                      <Badge variant="default" className="bg-emerald-600 text-white text-xs">
                        Accepted
                      </Badge>
                    ) : hasRevision ? (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                        Revision Requested
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-blue-600 border-blue-200 text-xs">
                        Under Review
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Delivery Note */}
                <p className="text-sm text-foreground whitespace-pre-wrap">{deliv.note}</p>

                {/* Attachments Section */}
                {deliv.attachments && deliv.attachments.length > 0 && (
                  <div className="pt-2">
                    <span className="text-xs font-semibold text-muted-foreground block mb-2">
                      Attachments ({deliv.attachments.length}):
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {deliv.attachments.map((att) => {
                        const isImage = att.mimeType?.startsWith('image/');
                        const fileUrl = att.url ? safeMediaUrl(att.url) : '';

                        if (isImage && fileUrl) {
                          return (
                            <a
                              key={att.id}
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative rounded-md border border-border overflow-hidden bg-muted/20 hover:border-primary transition-all p-1 flex items-center gap-2"
                              aria-label={`View ${att.fileName}`}
                            >
                              <img
                                src={fileUrl}
                                alt={att.fileName}
                                className="h-12 w-12 object-cover rounded-xs"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate group-hover:text-primary">
                                  {att.fileName}
                                </p>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatFileSize(att.sizeBytes)}
                                </span>
                              </div>
                            </a>
                          );
                        }

                        return (
                          <a
                            key={att.id}
                            href={fileUrl || '#'}
                            download={att.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/40 transition-colors text-xs text-foreground group"
                          >
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium group-hover:text-primary">
                                {att.fileName}
                              </p>
                              <span className="text-[10px] text-muted-foreground">
                                {formatFileSize(att.sizeBytes)}
                              </span>
                            </div>
                            <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Revision Note Banner if present */}
                {deliv.revisionNote && (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                    <span className="font-semibold block flex items-center gap-1 text-amber-800">
                      <RotateCcw className="h-3.5 w-3.5" /> Buyer Feedback / Revision Request:
                    </span>
                    <p className="whitespace-pre-wrap">{deliv.revisionNote}</p>
                  </div>
                )}

                {/* Buyer Actions: Accept / Request Revision */}
                {isBuyer && !isAccepted && isActionable && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDeliverableId(deliv.id);
                        setRevisionNote('');
                        setRevisionError(null);
                        setRevisionDialogOpen(true);
                      }}
                      disabled={revisionMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Request Revision
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        void handleAccept(deliv.id);
                      }}
                      disabled={acceptMutation.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Accept Deliverable
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revision Request Dialog */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revisions</DialogTitle>
            <DialogDescription>
              Specify what changes or corrections are needed before you can accept this deliverable.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <Label htmlFor="revision-note">Feedback & Revision Notes (required)</Label>
            <Textarea
              id="revision-note"
              value={revisionNote}
              onChange={(e) => {
                setRevisionNote(e.target.value);
                setRevisionError(null);
              }}
              placeholder="Detail the revisions requested..."
              rows={4}
              className={revisionError ? 'border-destructive' : ''}
              required
            />
            {revisionError && <p className="text-xs text-destructive">{revisionError}</p>}
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevisionDialogOpen(false)}
              disabled={revisionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                void handleRequestRevision();
              }}
              isLoading={revisionMutation.isPending}
            >
              Send Revision Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import * as React from 'react';
import { PlusCircle, CheckCircle2, Calendar, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/format';
import { useCreateMilestone, useUpdateMilestone } from '@/lib/api/agreements';
import { ApiError } from '@/lib/api/client';
import {
  milestoneCreateSchema,
  type AgreementDetail,
  type MilestoneResponse,
  type MilestoneStatus,
} from '@market/shared';

interface AgreementMilestonesProps {
  agreement: AgreementDetail;
  viewerId?: string;
  onRefetch?: () => void;
}

export function AgreementMilestones({ agreement, viewerId, onRefetch }: AgreementMilestonesProps) {
  const createMutation = useCreateMilestone(agreement.id, { viewerId });
  const updateMutation = useUpdateMilestone(agreement.id, { viewerId });

  const [isAdding, setIsAdding] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [addError, setAddError] = React.useState<string | null>(null);

  const isActionable = agreement.status === 'ACTIVE' || agreement.status === 'DELIVERED';

  const milestones: MilestoneResponse[] = agreement.milestones ?? [];

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const trimmedTitle = title.trim();

    let parsedAmountCents: number | undefined = undefined;
    if (amount.trim()) {
      const num = parseFloat(amount.trim());
      if (isNaN(num) || num < 0) {
        setAddError('Please enter a valid amount');
        return;
      }
      parsedAmountCents = Math.round(num * 100);
    }

    let parsedDueDate: string | undefined = undefined;
    if (dueDate.trim()) {
      try {
        const parsed = new Date(dueDate.trim());
        if (isNaN(parsed.getTime())) {
          setAddError('Please enter a valid due date');
          return;
        }
        parsedDueDate = parsed.toISOString();
      } catch {
        setAddError('Please enter a valid due date');
        return;
      }
    }

    const result = milestoneCreateSchema.safeParse({
      title: trimmedTitle,
      amountCents: parsedAmountCents,
      dueDate: parsedDueDate,
    });

    if (!result.success) {
      setAddError(result.error.issues[0]?.message ?? 'Invalid milestone details');
      return;
    }

    try {
      await createMutation.mutateAsync(result.data);
      toast.success('Milestone added', 'New milestone has been recorded.');
      setTitle('');
      setAmount('');
      setDueDate('');
      setIsAdding(false);
      setAddError(null);
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Could not add milestone', err.message);
      } else {
        toast.error('Could not add milestone', 'An unexpected error occurred.');
      }
      onRefetch?.();
    }
  };

  const handleStatusChange = async (milestoneId: string, newStatus: MilestoneStatus) => {
    try {
      await updateMutation.mutateAsync({
        milestoneId,
        data: { status: newStatus },
      });
      toast.success('Milestone updated', `Status changed to ${newStatus}`);
      onRefetch?.();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Could not update milestone', err.message);
      } else {
        toast.error('Could not update milestone', 'An unexpected error occurred.');
      }
      onRefetch?.();
    }
  };

  const getMilestoneStatusBadge = (status: MilestoneStatus) => {
    switch (status) {
      case 'DONE':
        return (
          <Badge variant="default" className="bg-emerald-600 text-white text-xs">
            Done
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
            In Progress
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card className="p-6 mb-6 shadow-xs border-border/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Project Milestones</h2>
          <p className="text-xs text-muted-foreground">
            Track key deliverables and agreed stages of the project.
          </p>
        </div>

        {isActionable && !isAdding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add Milestone
          </Button>
        )}
      </div>

      {/* Add milestone inline form */}
      {isAdding && (
        <form
          onSubmit={(e) => {
            void handleAddMilestone(e);
          }}
          className="mb-5 p-4 rounded-lg bg-muted/30 border border-border space-y-3"
          aria-label="Add new milestone"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">New Milestone</h3>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setAddError(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <Label htmlFor="milestone-title" className="text-xs">
                Title *
              </Label>
              <Input
                id="milestone-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setAddError(null);
                }}
                placeholder="e.g. Initial Prototype"
                className="h-8 text-sm"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="milestone-amount" className="text-xs">
                Amount ({agreement.bid?.currency ?? 'USD'})
              </Label>
              <Input
                id="milestone-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAddError(null);
                }}
                placeholder="Optional"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="milestone-due" className="text-xs">
                Due Date
              </Label>
              <Input
                id="milestone-due"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setAddError(null);
                }}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {addError && <p className="text-xs text-destructive">{addError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setAddError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={createMutation.isPending}>
              Save Milestone
            </Button>
          </div>
        </form>
      )}

      {/* Milestones list */}
      {milestones.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground text-xs">
          No milestones defined yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {milestones.map((m, idx) => {
            return (
              <div
                key={m.id}
                className="p-3.5 rounded-lg border border-border/70 bg-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-border transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
                    <span className="font-semibold text-sm text-foreground">{m.title}</span>
                    {getMilestoneStatusBadge(m.status)}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {m.amountCents !== null && m.amountCents !== undefined && (
                      <span className="font-medium text-foreground">
                        {formatMoney(m.amountCents, agreement.bid?.currency ?? 'USD')}
                      </span>
                    )}
                    {m.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Due {formatDate(m.dueDate)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status action buttons */}
                {isActionable && (
                  <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-auto">
                    {m.status === 'PENDING' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => {
                          void handleStatusChange(m.id, 'IN_PROGRESS');
                        }}
                        disabled={updateMutation.isPending}
                      >
                        Start <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    )}
                    {m.status === 'IN_PROGRESS' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2 text-emerald-600 border-emerald-300"
                        onClick={() => {
                          void handleStatusChange(m.id, 'DONE');
                        }}
                        disabled={updateMutation.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                        Mark Done
                      </Button>
                    )}
                    {m.status === 'DONE' && (
                      <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1 px-2">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

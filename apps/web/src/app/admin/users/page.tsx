'use client';

import * as React from 'react';
import {
  AlertCircle,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/components/auth/auth-provider';
import { useAdminUsers, useUpdateAdminUser } from '@/lib/api/admin';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import type { AdminUserItem, Role, UserStatus } from '@/lib/api/admin-types';

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();

  // Search & Filters
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<Role | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = React.useState<UserStatus | 'ALL'>('ALL');

  // Pagination Cursor Stack for Previous/Next
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = React.useState<string[]>([]);

  // Dialog State
  const [selectedUser, setSelectedUser] = React.useState<AdminUserItem | null>(null);
  const [newRole, setNewRole] = React.useState<Role>('USER');
  const [newStatus, setNewStatus] = React.useState<UserStatus>('ACTIVE');
  const [reason, setReason] = React.useState('');
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setCursor(undefined);
      setCursorHistory([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = React.useMemo(
    () => ({
      q: debouncedQ || undefined,
      role: roleFilter === 'ALL' ? undefined : roleFilter,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      cursor,
      limit: 15,
    }),
    [debouncedQ, roleFilter, statusFilter, cursor],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUsers(queryParams);
  const updateUserMutation = useUpdateAdminUser();

  const handleOpenModifyDialog = (targetUser: AdminUserItem) => {
    setSelectedUser(targetUser);
    setNewRole(targetUser.role);
    setNewStatus(targetUser.status);
    setReason(targetUser.suspendedReason || '');
    setDialogError(null);
  };

  const handleCloseDialog = () => {
    setSelectedUser(null);
    setDialogError(null);
  };

  const handleSubmitUserUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (selectedUser.id === currentAdmin?.id) {
      setDialogError('You cannot modify your own administrator account.');
      return;
    }

    setDialogError(null);

    try {
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        input: {
          role: newRole,
          status: newStatus,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      });

      toast.success(
        'User updated',
        `Successfully updated ${selectedUser.displayName}'s role to ${newRole} and status to ${newStatus}.`,
      );
      handleCloseDialog();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setDialogError('Cannot demote the last remaining administrator on the platform.');
          toast.error('Action rejected', 'Cannot demote the last remaining administrator.');
          return;
        }
        if (err.status === 400) {
          setDialogError(err.message || 'You cannot modify your own administrator account.');
          toast.error('Action rejected', err.message);
          return;
        }
        if (err.status === 403) {
          setDialogError('You do not have permission to perform this modification.');
          toast.error('Permission denied', 'Administrator access required.');
          return;
        }
        setDialogError(err.message || 'Failed to update user.');
        toast.error('Update failed', err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setDialogError(msg);
        toast.error('Error', msg);
      }
    }
  };

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor || '']);
      setCursor(data.nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(prevCursor || undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-primary" />
          User Governance
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View platform members, update roles, manage suspension/ban status, and audit access.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* Search Query */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by display name or email..."
              className="pl-9 pr-8 text-xs"
              aria-label="Search users by name or email"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Role Filter */}
          <div>
            <Select
              value={roleFilter}
              onValueChange={(val) => {
                setRoleFilter(val as Role | 'ALL');
                setCursor(undefined);
                setCursorHistory([]);
              }}
            >
              <SelectTrigger className="w-full text-xs" aria-label="Filter by user role">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div>
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val as UserStatus | 'ALL');
                setCursor(undefined);
                setCursorHistory([]);
              }}
            >
              <SelectTrigger className="w-full text-xs" aria-label="Filter by user status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="BANNED">Banned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Main Table View */}
      <Card className="shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading users list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-border/50"
              >
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <ErrorState
              title="Failed to Load Users"
              message={
                error instanceof Error
                  ? error.message
                  : 'An error occurred while loading the user directory.'
              }
              retryLabel="Retry"
              onRetry={() => void refetch()}
            />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={UsersIcon}
              title="No Users Found"
              description="No user accounts match your current search and filter criteria."
              action={
                searchInput || roleFilter !== 'ALL' || statusFilter !== 'ALL' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchInput('');
                      setRoleFilter('ALL');
                      setStatusFilter('ALL');
                    }}
                  >
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" aria-label="Registered users table">
              <thead className="bg-muted/70 text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => {
                  const isSelf = Boolean(currentAdmin && item.id === currentAdmin.id);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`user-row-${item.id}`}
                    >
                      {/* Name & Email */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {item.displayName}
                            {isSelf && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1 py-0 bg-primary/10 text-primary"
                              >
                                You
                              </Badge>
                            )}
                          </span>
                          <span className="text-muted-foreground text-[11px] truncate max-w-xs">
                            {item.email}
                          </span>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3.5">
                        {item.role === 'ADMIN' ? (
                          <Badge
                            variant="default"
                            className="text-[10px] bg-primary text-primary-foreground font-semibold"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            User
                          </Badge>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">
                        {item.status === 'ACTIVE' && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-emerald-600 bg-emerald-500/10 dark:bg-emerald-500/20 font-medium"
                          >
                            <UserCheck className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        {item.status === 'SUSPENDED' && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-amber-600 bg-amber-500/10 dark:bg-amber-500/20 font-medium"
                            title={
                              item.suspendedReason ? `Reason: ${item.suspendedReason}` : undefined
                            }
                          >
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            Suspended
                          </Badge>
                        )}
                        {item.status === 'BANNED' && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] font-medium"
                            title={
                              item.suspendedReason ? `Reason: ${item.suspendedReason}` : undefined
                            }
                          >
                            <UserX className="h-3 w-3 mr-1" />
                            Banned
                          </Badge>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Action Button */}
                      <td className="px-4 py-3.5 text-right">
                        {isSelf ? (
                          <div
                            className="inline-flex items-center gap-1.5"
                            title="You cannot modify your own administrator account"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="text-xs opacity-50 cursor-not-allowed"
                              aria-label="Cannot modify your own administrator account"
                            >
                              Modify
                            </Button>
                            <span className="text-[11px] text-muted-foreground italic hidden sm:inline">
                              Cannot modify self
                            </span>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenModifyDialog(item)}
                            className="text-xs"
                            aria-label={`Modify user ${item.displayName}`}
                          >
                            Modify User
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing <strong className="text-foreground">{data.items.length}</strong> users
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0 || isFetching}
                className="text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!data.nextCursor || isFetching}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modify User Dialog */}
      {selectedUser && (
        <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-primary" />
                Modify User Account
              </DialogTitle>
              <DialogDescription>
                Update roles and governance status for <strong>{selectedUser.displayName}</strong> (
                {selectedUser.email}).
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                void handleSubmitUserUpdate(e);
              }}
              className="space-y-4 pt-2"
            >
              {dialogError && (
                <div
                  className="rounded-md bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{dialogError}</span>
                </div>
              )}

              {/* Role Select */}
              <div className="space-y-1.5">
                <Label htmlFor="user-role-select">Role Assignment</Label>
                <Select value={newRole} onValueChange={(val) => setNewRole(val as Role)}>
                  <SelectTrigger id="user-role-select" className="w-full text-xs">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Standard User</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Administrators have full governance privileges, moderation rights, and category
                  controls.
                </p>
              </div>

              {/* Status Select */}
              <div className="space-y-1.5">
                <Label htmlFor="user-status-select">Account Status</Label>
                <Select value={newStatus} onValueChange={(val) => setNewStatus(val as UserStatus)}>
                  <SelectTrigger id="user-status-select" className="w-full text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active (Normal access)</SelectItem>
                    <SelectItem value="SUSPENDED">
                      Suspended (Tokens revoked, temporary restriction)
                    </SelectItem>
                    <SelectItem value="BANNED">Banned (Permanent restriction)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reason */}
              {(newStatus === 'SUSPENDED' ||
                newStatus === 'BANNED' ||
                newRole !== selectedUser.role) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="user-reason-input">Reason for change</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {reason.length} / 2000
                    </span>
                  </div>
                  <Textarea
                    id="user-reason-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                    placeholder="Provide a justification note for the audit log..."
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
              )}

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  disabled={updateUserMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={newStatus === 'BANNED' ? 'destructive' : 'primary'}
                  isLoading={updateUserMutation.isPending}
                  disabled={updateUserMutation.isPending}
                >
                  Confirm Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

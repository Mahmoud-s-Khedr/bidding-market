'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FileText, FolderTree, History, Shield, ShieldAlert, Users } from 'lucide-react';
import { RequireAdmin } from '@/components/auth/require-admin';
import { cn } from '@/lib/utils';
import { useAdminStats } from '@/lib/api/admin';

interface AdminNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: (stats: ReturnType<typeof useAdminStats>['data']) => number | null;
}

const NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', icon: BarChart3, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/listings', label: 'Listings', icon: FileText },
  {
    href: '/admin/reports',
    label: 'Reports Queue',
    icon: ShieldAlert,
    badge: (stats) => (stats?.openReports && stats.openReports > 0 ? stats.openReports : null),
  },
  { href: '/admin/audit-log', label: 'Audit Log', icon: History },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: stats } = useAdminStats();

  const isActive = (item: AdminNavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  return (
    <RequireAdmin>
      <div className="container mx-auto px-4 py-6 sm:px-6 max-w-7xl">
        {/* Header Banner */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Administration Control Center
              </h1>
              <p className="text-xs text-muted-foreground">
                Marketplace moderation, user governance, category structure, and audit trails.
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Horizontal Navigation Tabs */}
        <div className="md:hidden mb-6 -mx-4 px-4 overflow-x-auto pb-2 scrollbar-none">
          <nav
            aria-label="Admin Navigation Tabs"
            className="flex items-center gap-1.5 min-w-max border-b border-border pb-2"
          >
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const badgeCount = item.badge?.(stats);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {badgeCount !== null && badgeCount !== undefined && badgeCount > 0 && (
                    <span
                      className={cn(
                        'ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                        active
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-destructive text-destructive-foreground',
                      )}
                    >
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Sidebar + Content Layout */}
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-6 gap-8 items-start">
          {/* Desktop Sidebar */}
          <aside className="hidden md:block md:col-span-1 lg:col-span-1 sticky top-24 space-y-1">
            <nav aria-label="Admin Sidebar Navigation" className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item);
                const badgeCount = item.badge?.(stats);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {badgeCount !== null && badgeCount !== undefined && badgeCount > 0 && (
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded-full text-xs font-bold leading-none',
                          active
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-destructive text-destructive-foreground',
                        )}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Subpage Content */}
          <main className="md:col-span-4 lg:col-span-5 min-w-0" role="main">
            {children}
          </main>
        </div>
      </div>
    </RequireAdmin>
  );
}

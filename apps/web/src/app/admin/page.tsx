'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart2,
  FileText,
  Gavel,
  ShieldAlert,
  Table as TableIcon,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useAdminStats } from '@/lib/api/admin';
import { cn } from '@/lib/utils';

type MetricKey = 'signups' | 'listings' | 'bids' | 'agreements';

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  strokeColor: string;
  fillColor: string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'signups',
    label: 'Signups',
    color: 'text-blue-500',
    strokeColor: '#3b82f6',
    fillColor: 'rgba(59, 130, 246, 0.1)',
  },
  {
    key: 'listings',
    label: 'Listings Created',
    color: 'text-emerald-500',
    strokeColor: '#10b981',
    fillColor: 'rgba(16, 185, 129, 0.1)',
  },
  {
    key: 'bids',
    label: 'Bids Placed',
    color: 'text-amber-500',
    strokeColor: '#f59e0b',
    fillColor: 'rgba(245, 158, 11, 0.1)',
  },
  {
    key: 'agreements',
    label: 'Agreements Formed',
    color: 'text-purple-500',
    strokeColor: '#8b5cf6',
    fillColor: 'rgba(139, 92, 246, 0.1)',
  },
];

export default function AdminOverviewPage() {
  const { data: stats, isLoading, isError, error, refetch } = useAdminStats();
  const [selectedMetric, setSelectedMetric] = React.useState<MetricKey>('signups');
  const [showTableAlternative, setShowTableAlternative] = React.useState(false);
  const [hoveredPoint, setHoveredPoint] = React.useState<{ day: string; value: number } | null>(
    null,
  );

  if (isLoading) {
    return (
      <div className="space-y-8" aria-busy="true" aria-label="Loading admin dashboard statistics">
        {/* Stat Tiles Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-full" />
            </Card>
          ))}
        </div>
        {/* Chart Skeleton */}
        <Card className="p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </Card>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="p-6">
        <ErrorState
          title="Failed to Load Dashboard Statistics"
          message={
            error instanceof Error
              ? error.message
              : 'Could not retrieve marketplace administrative metrics.'
          }
          retryLabel="Try Again"
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const totalUsers = stats.users.ACTIVE + stats.users.SUSPENDED + stats.users.BANNED;
  const totalListings =
    stats.listings.DRAFT +
    stats.listings.OPEN +
    stats.listings.IN_PROGRESS +
    stats.listings.COMPLETED +
    stats.listings.CLOSED +
    stats.listings.REMOVED;
  const totalAgreements =
    stats.agreements.ACTIVE +
    stats.agreements.DELIVERED +
    stats.agreements.COMPLETED +
    stats.agreements.CANCELLED +
    stats.agreements.DISPUTED;

  const daily = stats.daily || [];
  const currentMetricConfig: MetricConfig =
    METRICS.find((m) => m.key === selectedMetric) ?? (METRICS[0] as MetricConfig);

  // SVG Chart Dimensions & Computations
  const width = 800;
  const height = 260;
  const paddingX = 40;
  const paddingY = 30;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const values = daily.map((d) => d[selectedMetric] || 0);
  const maxValue = Math.max(...values, 5); // default min scale
  const points = daily.map((d, index) => {
    const x = paddingX + (index / Math.max(daily.length - 1, 1)) * innerWidth;
    const y = height - paddingY - (d[selectedMetric] / maxValue) * innerHeight;
    return { x, y, day: d.day, value: d[selectedMetric] };
  });

  const pathD = points.reduce(
    (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`,
    '',
  );
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaD =
    firstPoint && lastPoint
      ? `${pathD} L ${lastPoint.x.toFixed(1)},${height - paddingY} L ${firstPoint.x.toFixed(1)},${height - paddingY} Z`
      : '';

  const isDataEmpty = values.every((v) => v === 0);

  return (
    <div className="space-y-8">
      {/* Overview Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Users Tile */}
        <Card className="hover:border-primary/40 transition-colors shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold tracking-tight text-foreground">{totalUsers}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-emerald-600 font-medium">{stats.users.ACTIVE} active</span>
              <span>•</span>
              <span className="text-amber-600">{stats.users.SUSPENDED} suspended</span>
              <span>•</span>
              <span className="text-destructive">{stats.users.BANNED} banned</span>
            </div>
            <div className="pt-1">
              <Link
                href="/admin/users"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                Manage users <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Listings Tile */}
        <Card className="hover:border-primary/40 transition-colors shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Listings
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold tracking-tight text-foreground">{totalListings}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-emerald-600 font-medium">{stats.listings.OPEN} open</span>
              <span>•</span>
              <span>{stats.listings.IN_PROGRESS} in-progress</span>
              <span>•</span>
              <span className="text-destructive">{stats.listings.REMOVED} removed</span>
            </div>
            <div className="pt-1">
              <Link
                href="/admin/listings"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                Review listings <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Bids & Agreements Tile */}
        <Card className="hover:border-primary/40 transition-colors shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Market Activity
            </CardTitle>
            <Gavel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.bids} Bids
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-purple-600 font-medium">{totalAgreements} agreements</span>
              <span>•</span>
              <span>{stats.agreements.COMPLETED} completed</span>
              <span>•</span>
              <span className="text-amber-600">{stats.agreements.DISPUTED} disputed</span>
            </div>
            <div className="pt-1 text-xs text-muted-foreground">
              {stats.agreements.ACTIVE} active contracts currently running
            </div>
          </CardContent>
        </Card>

        {/* Reports Queue Tile */}
        <Card
          className={cn(
            'hover:border-primary/40 transition-colors shadow-xs',
            stats.openReports > 0 ? 'border-amber-400/60 bg-amber-500/5 dark:bg-amber-500/10' : '',
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reports Queue
            </CardTitle>
            <ShieldAlert
              className={cn(
                'h-4 w-4',
                stats.openReports > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
            />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {stats.openReports}
              </span>
              {stats.openReports > 0 ? (
                <Badge variant="destructive" className="text-xs">
                  Action Required
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs text-emerald-600">
                  Clean
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.openReports === 1
                ? '1 pending report awaits review'
                : `${stats.openReports} pending reports await review`}
            </p>
            <div className="pt-1">
              <Link
                href="/admin/reports"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                Go to moderation queue <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 30-Day Activity Charts Section */}
      <Card className="shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                30-Day Market Activity Trends
              </CardTitle>
              <CardDescription>
                Historical series across signups, listing postings, bids, and contracts.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={showTableAlternative ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowTableAlternative(!showTableAlternative)}
                aria-pressed={showTableAlternative}
                aria-label={
                  showTableAlternative
                    ? 'Switch to interactive chart view'
                    : 'Switch to accessible data table'
                }
                className="text-xs"
              >
                <TableIcon className="h-3.5 w-3.5 mr-1.5" />
                {showTableAlternative ? 'Show Chart' : 'Show Data Table'}
              </Button>
            </div>
          </div>

          {/* Metric Selector Tabs */}
          <div
            role="tablist"
            aria-label="Select activity metric to display"
            className="flex flex-wrap items-center gap-2 pt-3 border-t border-border mt-3"
          >
            {METRICS.map((metric) => {
              const active = selectedMetric === metric.key;
              const totalForMetric = daily.reduce((sum, d) => sum + (d[metric.key] || 0), 0);

              return (
                <button
                  key={metric.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedMetric(metric.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-secondary text-foreground font-semibold ring-1 ring-border shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: metric.strokeColor }}
                  />
                  <span>{metric.label}</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded-full font-bold">
                    {totalForMetric}
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent>
          {showTableAlternative ? (
            /* Accessible Table Alternative */
            <div className="overflow-x-auto border border-border rounded-lg">
              <table
                className="w-full text-xs text-left"
                aria-label="30-day marketplace metrics data table"
              >
                <caption className="sr-only">
                  Marketplace signups, listings, bids, and agreements over the last 30 days
                </caption>
                <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Signups
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Listings
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Bids
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Agreements
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {daily.map((row) => (
                    <tr key={row.day} className="hover:bg-muted/40 transition-colors">
                      <th scope="row" className="px-4 py-2 font-medium text-foreground">
                        {row.day}
                      </th>
                      <td className="px-4 py-2 text-right">{row.signups}</td>
                      <td className="px-4 py-2 text-right">{row.listings}</td>
                      <td className="px-4 py-2 text-right">{row.bids}</td>
                      <td className="px-4 py-2 text-right">{row.agreements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isDataEmpty ? (
            <div className="py-12">
              <EmptyState
                icon={BarChart2}
                title="No Activity Data in the Last 30 Days"
                description={`There have been zero ${currentMetricConfig.label.toLowerCase()} recorded in this 30-day window.`}
              />
            </div>
          ) : (
            /* Inline Accessible SVG Chart */
            <div className="space-y-2">
              <div
                className="relative w-full overflow-hidden"
                role="img"
                aria-label={`30-day trend chart of ${currentMetricConfig.label}. Maximum value is ${maxValue}.`}
              >
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-auto overflow-visible select-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id={`grad-${selectedMetric}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop
                        offset="0%"
                        stopColor={currentMetricConfig.strokeColor}
                        stopOpacity="0.25"
                      />
                      <stop
                        offset="100%"
                        stopColor={currentMetricConfig.strokeColor}
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = height - paddingY - ratio * innerHeight;
                    const val = Math.round(ratio * maxValue);
                    return (
                      <g key={ratio}>
                        <line
                          x1={paddingX}
                          y1={y}
                          x2={width - paddingX}
                          y2={y}
                          stroke="currentColor"
                          className="text-border"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text
                          x={paddingX - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-muted-foreground text-[10px]"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area Fill */}
                  {areaD && (
                    <path
                      d={areaD}
                      fill={`url(#grad-${selectedMetric})`}
                      className="transition-all duration-300"
                    />
                  )}

                  {/* Trend Line */}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={currentMetricConfig.strokeColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />
                  )}

                  {/* Data Points and Interactivity */}
                  {points.map((pt) => {
                    const isHovered = hoveredPoint?.day === pt.day;
                    return (
                      <g key={pt.day}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5 : 3}
                          fill={currentMetricConfig.strokeColor}
                          stroke="var(--background)"
                          strokeWidth="2"
                          className="cursor-pointer transition-all hover:scale-125"
                          onMouseEnter={() => setHoveredPoint({ day: pt.day, value: pt.value })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      </g>
                    );
                  })}

                  {/* X-axis Date Labels (sample 6 dates) */}
                  {points
                    .filter(
                      (_, i) =>
                        i === 0 || i === 7 || i === 14 || i === 21 || i === points.length - 1,
                    )
                    .map((pt) => (
                      <text
                        key={pt.day}
                        x={pt.x}
                        y={height - 8}
                        textAnchor="middle"
                        className="fill-muted-foreground text-[10px]"
                      >
                        {pt.day.slice(5)}
                      </text>
                    ))}
                </svg>

                {/* Hover Tooltip Overlay */}
                {hoveredPoint && (
                  <div
                    className="pointer-events-none absolute top-2 right-4 rounded-md bg-popover/95 border border-border px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
                    role="tooltip"
                  >
                    <p className="font-semibold text-foreground">{hoveredPoint.day}</p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{hoveredPoint.value}</span>{' '}
                      {currentMetricConfig.label.toLowerCase()}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                Showing daily count for <strong>{currentMetricConfig.label}</strong> over the past
                30 days. Use &ldquo;Show Data Table&rdquo; above for raw tabular figures.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

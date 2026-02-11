/**
 * Plugin Analytics Component
 *
 * Displays analytics and statistics for a plugin:
 * - Key metrics (downloads, installs, ratings, average rating)
 * - Time range selector
 * - Tenant install list (from getPluginInstalls endpoint)
 */

import { useState } from 'react';
import { Button, Badge, Card } from '@plexica/ui';
import { X, Download, Users, Star, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Plugin } from '@/types';

interface PluginAnalyticsProps {
  plugin: Plugin;
  onClose: () => void;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

export function PluginAnalytics({ plugin, onClose }: PluginAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  // Fetch analytics from the real API shape: { downloads, installs, ratings, averageRating }
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ['plugin-analytics', plugin.id, timeRange],
    queryFn: () => apiClient.getPluginAnalytics(plugin.id, timeRange),
    retry: false,
  });

  // Fetch tenant installs list
  const { data: installs, isLoading: installsLoading } = useQuery({
    queryKey: ['plugin-installs', plugin.id],
    queryFn: () => apiClient.getPluginInstalls(plugin.id),
    retry: false,
  });

  // Fetch ratings for distribution
  const { data: ratingsData } = useQuery({
    queryKey: ['plugin-ratings', plugin.id],
    queryFn: () => apiClient.getPluginRatings(plugin.id, { limit: 100 }),
    retry: false,
  });

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTimeRangeLabel = (range: TimeRange): string => {
    switch (range) {
      case '7d':
        return 'Last 7 Days';
      case '30d':
        return 'Last 30 Days';
      case '90d':
        return 'Last 90 Days';
      case 'all':
        return 'All Time';
    }
  };

  // Compute rating distribution from actual ratings data
  const ratingDistribution = (() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (ratingsData?.data) {
      for (const r of ratingsData.data) {
        const bucket = Math.min(5, Math.max(1, Math.round(r.rating)));
        dist[bucket] = (dist[bucket] || 0) + 1;
      }
    }
    return dist;
  })();

  const totalRatings = Object.values(ratingDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Plugin Analytics</h2>
            <p className="text-sm text-muted-foreground mt-1">{plugin.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    timeRange === range
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {getTimeRangeLabel(range).replace('Last ', '')}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
                <p className="text-muted-foreground">Loading analytics...</p>
              </div>
            </div>
          ) : analyticsError ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">
                Failed to load analytics data.{' '}
                {analyticsError instanceof Error ? analyticsError.message : ''}
              </p>
            </Card>
          ) : analytics ? (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Download className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(analytics.downloads)}
                  </p>
                  <p className="text-xs text-muted-foreground">Downloads</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(analytics.installs)}
                  </p>
                  <p className="text-xs text-muted-foreground">Installs</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {analytics.averageRating > 0
                      ? `${analytics.averageRating.toFixed(1)}/5`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">Average Rating</p>
                  {analytics.ratings > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ({analytics.ratings} rating{analytics.ratings !== 1 ? 's' : ''})
                    </p>
                  )}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(installs?.length ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Tenants</p>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Tenant Installs */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Installed By</h3>
                  {installsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : installs && installs.length > 0 ? (
                    <div className="space-y-3">
                      {installs.slice(0, 10).map((install, index) => (
                        <div key={install.tenantId} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground font-mono">
                              {install.tenantId.substring(0, 8)}...
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(install.installedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="secondary">{index + 1}</Badge>
                        </div>
                      ))}
                      {installs.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          +{installs.length - 10} more tenants
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No installations yet</p>
                  )}
                </Card>

                {/* Rating Distribution */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    Rating Distribution
                  </h3>
                  {totalRatings > 0 ? (
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((rating) => {
                        const count = ratingDistribution[rating] || 0;
                        const percentage = totalRatings > 0 ? (count / totalRatings) * 100 : 0;

                        return (
                          <div key={rating} className="flex items-center gap-2">
                            <div className="flex items-center gap-1 w-12">
                              <span className="text-sm font-medium text-foreground">{rating}</span>
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            </div>
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-yellow-500 h-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ratings yet</p>
                  )}
                </Card>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing data for {getTimeRangeLabel(timeRange).toLowerCase()}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

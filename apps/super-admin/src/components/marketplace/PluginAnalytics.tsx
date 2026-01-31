/**
 * Plugin Analytics Component
 *
 * Displays analytics and statistics for a plugin:
 * - Download/install counts over time
 * - Time range selector
 * - Key metrics (total downloads, installs, growth rate)
 * - Top tenants using the plugin
 * - Rating distribution
 */

import { useState, useEffect } from 'react';
import { Button, Badge, Card } from '@plexica/ui';
import { X, TrendingUp, TrendingDown, Download, Users, Star, Calendar } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Plugin } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface PluginAnalyticsProps {
  plugin: Plugin;
  onClose: () => void;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

interface AnalyticsData {
  totalDownloads: number;
  totalInstalls: number;
  activeInstalls: number;
  growthRate: number;
  downloadsByDay: Array<{ date: string; count: number }>;
  installsByDay: Array<{ date: string; count: number }>;
  topTenants: Array<{ tenantName: string; installDate: string }>;
  ratingDistribution: { [key: number]: number };
}

export function PluginAnalytics({ plugin, onClose }: PluginAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, [plugin.id, timeRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getPluginAnalytics(plugin.id, timeRange);
      setAnalyticsData(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast({
        title: 'Failed to load analytics',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
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

  const renderSimpleChart = (data: Array<{ date: string; count: number }>, color: string) => {
    if (!data || data.length === 0) {
      return (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          No data available
        </div>
      );
    }

    const maxValue = Math.max(...data.map((d) => d.count), 1);

    return (
      <div className="h-40 flex items-end gap-1">
        {data.map((item, index) => {
          const height = (item.count / maxValue) * 100;
          return (
            <div key={index} className="flex-1 flex flex-col items-center group">
              <div className="relative w-full">
                <div
                  className={`w-full rounded-t transition-all ${color} hover:opacity-80`}
                  style={{ height: `${Math.max(height, 2)}px` }}
                  title={`${new Date(item.date).toLocaleDateString()}: ${item.count}`}
                />
              </div>
              {data.length <= 30 && index % Math.ceil(data.length / 7) === 0 && (
                <span className="text-xs text-muted-foreground mt-1 rotate-[-45deg] origin-top-left">
                  {new Date(item.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
                <p className="text-muted-foreground">Loading analytics...</p>
              </div>
            </div>
          ) : analyticsData ? (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Download className="h-5 w-5 text-blue-500" />
                    {analyticsData.growthRate > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : analyticsData.growthRate < 0 ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(analyticsData.totalDownloads)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Downloads</p>
                  {analyticsData.growthRate !== 0 && (
                    <p
                      className={`text-xs mt-1 ${
                        analyticsData.growthRate > 0 ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {analyticsData.growthRate > 0 ? '+' : ''}
                      {analyticsData.growthRate.toFixed(1)}%
                    </p>
                  )}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(analyticsData.totalInstalls)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Installs</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(analyticsData.activeInstalls)}
                  </p>
                  <p className="text-xs text-muted-foreground">Active Installs</p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {plugin.averageRating?.toFixed(1) || 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">Average Rating</p>
                  {plugin.ratingCount && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ({plugin.ratingCount} rating{plugin.ratingCount !== 1 ? 's' : ''})
                    </p>
                  )}
                </Card>
              </div>

              {/* Downloads Chart */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Download className="h-5 w-5 text-blue-500" />
                  <h3 className="text-lg font-semibold text-foreground">Downloads Over Time</h3>
                </div>
                {renderSimpleChart(analyticsData.downloadsByDay, 'bg-blue-500')}
              </Card>

              {/* Installs Chart */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-purple-500" />
                  <h3 className="text-lg font-semibold text-foreground">Installs Over Time</h3>
                </div>
                {renderSimpleChart(analyticsData.installsByDay, 'bg-purple-500')}
              </Card>

              <div className="grid grid-cols-2 gap-6">
                {/* Top Tenants */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Top Tenants</h3>
                  {analyticsData.topTenants.length > 0 ? (
                    <div className="space-y-3">
                      {analyticsData.topTenants.slice(0, 5).map((tenant, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {tenant.tenantName}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Installed {new Date(tenant.installDate).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="secondary">{index + 1}</Badge>
                        </div>
                      ))}
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
                  {Object.keys(analyticsData.ratingDistribution).length > 0 ? (
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((rating) => {
                        const count = analyticsData.ratingDistribution[rating] || 0;
                        const total = Object.values(analyticsData.ratingDistribution).reduce(
                          (a, b) => a + b,
                          0
                        );
                        const percentage = total > 0 ? (count / total) * 100 : 0;

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
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">Failed to load analytics data</p>
            </Card>
          )}
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

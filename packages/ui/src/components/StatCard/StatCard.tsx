import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '../Card/Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The metric label. */
  label: string;
  /** The metric value to display. */
  value: string | number;
  /** Optional trend percentage (positive = up, negative = down). */
  trend?: number;
  /** Optional icon to display alongside the value. */
  icon?: React.ReactNode;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, trend, icon, className, ...props }, ref) => {
    return (
      <Card ref={ref} className={cn(className)} {...props}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
            {icon && (
              <div className="text-muted-foreground" data-testid="stat-card-icon">
                {icon}
              </div>
            )}
          </div>
          {trend != null && (
            <div
              className={cn(
                'mt-2 flex items-center gap-1 text-sm font-medium',
                trend >= 0 ? 'text-green-600' : 'text-red-600'
              )}
              data-testid="stat-card-trend"
            >
              {trend >= 0 ? (
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {trend >= 0 ? '+' : ''}
                {trend}%
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
StatCard.displayName = 'StatCard';

export { StatCard };

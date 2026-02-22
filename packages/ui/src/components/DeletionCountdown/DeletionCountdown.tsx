// File: packages/ui/src/components/DeletionCountdown/DeletionCountdown.tsx
// T001-20: Deletion countdown display per Spec 001 design spec.
//
// Variants:
// - `inline` — compact text for list rows ("29 days")
// - `banner` — full warning banner for detail modal
//
// Urgency escalation:
// - > 7 days  → amber
// - ≤ 7 days  → bold amber
// - ≤ 24 hours → red pulse animation
// - Past date → "Deletion imminent"
//
// Refreshes every hour via setInterval.
// role="timer", aria-live="polite"

import * as React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TimeRemaining {
  totalMs: number;
  days: number;
  hours: number;
  isPast: boolean;
  isWithin24h: boolean;
  isWithin7d: boolean;
}

function computeRemaining(deletionScheduledAt: Date): TimeRemaining {
  const now = Date.now();
  const target = deletionScheduledAt.getTime();
  const totalMs = target - now;
  const isPast = totalMs <= 0;
  const totalHours = Math.max(0, Math.floor(totalMs / (1000 * 60 * 60)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return {
    totalMs,
    days,
    hours,
    isPast,
    isWithin24h: !isPast && totalMs <= 24 * 60 * 60 * 1000,
    isWithin7d: !isPast && totalMs <= 7 * 24 * 60 * 60 * 1000,
  };
}

function formatInline(tr: TimeRemaining): string {
  if (tr.isPast) return 'Deletion imminent';
  if (tr.isWithin24h) {
    if (tr.hours === 0) return 'Less than 1 hour';
    return `${tr.hours}h`;
  }
  if (tr.days === 1) return '1 day';
  return `${tr.days} days`;
}

function formatBannerText(tr: TimeRemaining): string {
  if (tr.isPast) return 'This tenant is scheduled for immediate deletion.';
  if (tr.isWithin24h) {
    const h = tr.hours;
    return `This tenant will be permanently deleted in ${h <= 0 ? 'less than 1 hour' : `${h} hour${h !== 1 ? 's' : ''}`}.`;
  }
  const d = tr.days;
  return `This tenant is scheduled for permanent deletion in ${d} day${d !== 1 ? 's' : ''}.`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeletionCountdownProps {
  /** ISO date string or Date */
  deletionScheduledAt: string | Date;
  /** Display variant */
  variant?: 'inline' | 'banner';
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeletionCountdown({
  deletionScheduledAt,
  variant = 'inline',
  className,
}: DeletionCountdownProps) {
  const targetDate = React.useMemo(
    () =>
      deletionScheduledAt instanceof Date ? deletionScheduledAt : new Date(deletionScheduledAt),
    [deletionScheduledAt]
  );

  const [remaining, setRemaining] = React.useState<TimeRemaining>(() =>
    computeRemaining(targetDate)
  );

  // Refresh every hour
  React.useEffect(() => {
    const update = () => setRemaining(computeRemaining(targetDate));
    const id = setInterval(update, 60 * 60 * 1000);
    update(); // immediate update when prop changes
    return () => clearInterval(id);
  }, [targetDate]);

  if (variant === 'inline') {
    return (
      <span
        role="timer"
        aria-live="polite"
        aria-label={`Deletion scheduled in: ${formatInline(remaining)}`}
        className={cn(
          'text-sm font-medium',
          remaining.isPast && 'text-destructive font-bold',
          !remaining.isPast && remaining.isWithin24h && 'text-destructive font-bold animate-pulse',
          !remaining.isPast &&
            remaining.isWithin7d &&
            !remaining.isWithin24h &&
            'text-amber-600 font-bold',
          !remaining.isPast && !remaining.isWithin7d && 'text-amber-500',
          className
        )}
      >
        {formatInline(remaining)}
      </span>
    );
  }

  // Banner variant
  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`Deletion countdown: ${formatBannerText(remaining)}`}
      className={cn(
        'rounded-lg border p-4 flex items-start gap-3',
        remaining.isPast || remaining.isWithin24h
          ? 'border-destructive/40 bg-destructive/10'
          : 'border-amber-400/40 bg-amber-50 dark:bg-amber-950/20',
        remaining.isWithin24h && !remaining.isPast && 'animate-pulse',
        className
      )}
    >
      <AlertTriangle
        className={cn(
          'w-5 h-5 shrink-0 mt-0.5',
          remaining.isPast || remaining.isWithin24h ? 'text-destructive' : 'text-amber-500'
        )}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-semibold',
            remaining.isPast || remaining.isWithin24h
              ? 'text-destructive'
              : remaining.isWithin7d
                ? 'text-amber-700 dark:text-amber-400 font-bold'
                : 'text-amber-700 dark:text-amber-400'
          )}
        >
          {remaining.isPast
            ? 'Deletion imminent'
            : remaining.isWithin24h
              ? 'Deletion in less than 24 hours!'
              : remaining.isWithin7d
                ? `Deletion in ${remaining.days} day${remaining.days !== 1 ? 's' : ''}`
                : `Scheduled for deletion`}
        </p>
        <p
          className={cn(
            'text-xs mt-0.5',
            remaining.isPast || remaining.isWithin24h
              ? 'text-destructive/80'
              : 'text-amber-600 dark:text-amber-500'
          )}
        >
          {formatBannerText(remaining)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>
          {remaining.isPast
            ? 'Now'
            : remaining.isWithin24h
              ? `${remaining.hours}h left`
              : `${remaining.days}d left`}
        </span>
      </div>
    </div>
  );
}

// File: apps/super-admin/src/components/observability/AutoRefreshIndicator.tsx
//
// Displays a countdown to the next auto-refresh and a manual refresh trigger.
// Counts down from `intervalSeconds` to 0, then calls `onRefresh`.
//
// Spec 012 — T012-30 (shared by Health and Metrics tabs)

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@plexica/ui';

export interface AutoRefreshIndicatorProps {
  /** Refresh interval in seconds (e.g. 30) */
  intervalSeconds: number;
  /** Called when the interval fires OR when the user clicks Refresh */
  onRefresh: () => void;
  /** Whether a refresh is currently in-flight */
  isRefreshing?: boolean;
}

export function AutoRefreshIndicator({
  intervalSeconds,
  onRefresh,
  isRefreshing = false,
}: AutoRefreshIndicatorProps) {
  const [remaining, setRemaining] = useState(intervalSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown whenever intervalSeconds changes or a refresh fires
  const resetTimer = () => setRemaining(intervalSeconds);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onRefresh();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSeconds]);

  const handleManualRefresh = () => {
    resetTimer();
    onRefresh();
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-live="polite" aria-atomic="true">
        Next refresh in {remaining}s
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Refresh now"
        onClick={handleManualRefresh}
        disabled={isRefreshing}
        className="h-7 px-2"
      >
        <RefreshCw
          className={['h-3.5 w-3.5', isRefreshing ? 'animate-spin' : ''].join(' ')}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}

// apps/web/src/components/auth/RateLimitCountdown.tsx
//
// Displays a countdown timer when the user hits a rate limit (HTTP 429).
// Per spec: aria-live="polite" announces every 15 s (not every 1 s).
// Parent should disable the Sign In button while countdown > 0.

import { useEffect, useRef, useState } from 'react';

interface RateLimitCountdownProps {
  /** Seconds remaining until retry is allowed (from Retry-After header) */
  retryAfterSeconds?: number;
  /** Called when the countdown reaches 0 */
  onExpired?: () => void;
  className?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RateLimitCountdown({
  retryAfterSeconds = 60,
  onExpired,
  className,
}: RateLimitCountdownProps) {
  const [remaining, setRemaining] = useState(retryAfterSeconds);
  // Announcement text — only updated every 15 s to avoid noisy screen readers
  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncedRef = useRef(retryAfterSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onExpired?.();
      return;
    }

    const timer = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;

        // Announce every 15 seconds (and at the last 5 seconds)
        if (lastAnnouncedRef.current - next >= 15 || (next > 0 && next <= 5)) {
          setAnnouncement(`Please wait ${formatTime(next)} before trying again.`);
          lastAnnouncedRef.current = next;
        }

        if (next <= 0) {
          clearInterval(timer);
          onExpired?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining, onExpired]);

  return (
    <div
      role="alert"
      className={[
        'rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800',
        'dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="font-medium">Too many sign-in attempts</p>
      <p className="mt-1">
        Please wait{' '}
        <span className="font-mono font-semibold" aria-label={`${remaining} seconds`}>
          {formatTime(remaining)}
        </span>{' '}
        before trying again.
      </p>

      {/* Screen reader announcements — updated every 15 s */}
      <span role="timer" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

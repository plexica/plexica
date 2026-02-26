// apps/web/src/components/plugins/PluginTimeline.tsx
//
// Vertical lifecycle timeline showing all state transitions for a plugin.
// Transitions are displayed in reverse chronological order (most recent first).
// Each entry shows: previous state → new state, timestamp, and an icon dot.

import type { PluginLifecycleStatus } from '@plexica/types';

export interface TimelineEntry {
  from?: PluginLifecycleStatus;
  to: PluginLifecycleStatus;
  timestamp: string;
  note?: string;
}

interface PluginTimelineProps {
  entries: TimelineEntry[];
  currentStatus: PluginLifecycleStatus;
}

/** Human-readable label for each lifecycle status */
const STATUS_LABELS: Record<PluginLifecycleStatus, string> = {
  REGISTERED: 'Registered',
  INSTALLING: 'Installing',
  INSTALLED: 'Installed',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
  UNINSTALLING: 'Uninstalling',
  UNINSTALLED: 'Uninstalled',
};

/** Colour accent for each lifecycle status */
const STATUS_COLORS: Record<PluginLifecycleStatus, string> = {
  REGISTERED: 'bg-blue-500',
  INSTALLING: 'bg-yellow-500',
  INSTALLED: 'bg-cyan-500',
  ACTIVE: 'bg-green-500',
  DISABLED: 'bg-gray-400',
  UNINSTALLING: 'bg-orange-500',
  UNINSTALLED: 'bg-red-500',
};

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function PluginTimeline({ entries, currentStatus }: PluginTimelineProps) {
  // Sort descending (most recent first)
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (sorted.length === 0) {
    // Synthesise a single "current state" entry when no history is available
    const synth: TimelineEntry = {
      to: currentStatus,
      timestamp: new Date().toISOString(),
    };
    sorted.push(synth);
  }

  return (
    <div className="relative pl-6" aria-label="Plugin lifecycle timeline" role="list">
      {/* Vertical connector line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />

      {sorted.map((entry, idx) => (
        <div
          key={`${entry.to}-${entry.timestamp}-${idx}`}
          className="relative mb-6 last:mb-0"
          role="listitem"
        >
          {/* Dot */}
          <span
            className={`absolute -left-[18px] top-1 h-3 w-3 rounded-full border-2 border-background ${STATUS_COLORS[entry.to]}`}
            aria-hidden="true"
          />

          {/* Content */}
          <div>
            <p className="text-sm font-medium text-foreground">
              {entry.from ? (
                <>
                  <span className="text-muted-foreground">{STATUS_LABELS[entry.from]}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                </>
              ) : null}
              <span>{STATUS_LABELS[entry.to]}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatTimestamp(entry.timestamp)}
            </p>
            {entry.note && (
              <p className="text-xs text-muted-foreground mt-1 italic">{entry.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

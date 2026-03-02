// apps/web/src/hooks/useJobStatusStream.ts
//
// T007-35 — SSE client hook for real-time job status events.
// Connects to the same GET /api/v1/notifications/stream endpoint and listens
// for `job_status` events. Follows ADR-023.
//
// Features:
//  - Automatic reconnect with exponential back-off (1s → 2s → 4s → … → 30s cap)
//  - Tracks connection state and last received job_status event
//  - Cleans up on component unmount

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobStatusEvent {
  id?: string;
  type: 'job_status';
  data: {
    jobId: string;
    jobName: string;
    status: string;
    progress?: number;
    failedReason?: string;
    [key: string]: unknown;
  };
}

export interface UseJobStatusStreamResult {
  /** True while the SSE connection is established. */
  isConnected: boolean;
  /** Most recently received job_status event. */
  lastEvent: JobStatusEvent | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000';
const SSE_PATH = '/api/v1/notifications/stream';
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useJobStatusStream(): UseJobStatusStreamResult {
  const tokenSet = useAuthStore((s) => s.tokenSet);
  const token = tokenSet?.accessToken ?? null;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<JobStatusEvent | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!token) return;

    const url = `${API_URL}${SSE_PATH}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;
    };

    es.addEventListener('job_status', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(e.data as string) as JobStatusEvent['data'];
        setLastEvent({ type: 'job_status', id: e.lastEventId || undefined, data: parsed });
      } catch {
        // Ignore malformed event data
      }
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();
      esRef.current = null;

      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    if (token) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [token, connect]);

  return { isConnected, lastEvent };
}

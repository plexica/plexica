// apps/web/src/hooks/useNotificationStream.ts
//
// T007-34 — SSE client hook for real-time notification events.
// Connects to GET /api/v1/notifications/stream?token=<accessToken>.
// Follows ADR-023: SSE via EventSource, Redis pub/sub fan-out.
//
// Features:
//  - Automatic reconnect with exponential back-off (1s → 2s → 4s → …→ 30s cap)
//  - Tracks connection state and last received notification event
//  - Cleans up on component unmount

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationStreamEvent {
  id?: string;
  type: 'notification';
  data: {
    notificationId: string;
    title: string;
    body: string;
    unreadCount: number;
    [key: string]: unknown;
  };
}

export interface UseNotificationStreamResult {
  /** True while the SSE connection is established. */
  isConnected: boolean;
  /** Last error message (null when healthy). */
  error: string | null;
  /** Most recently received notification event. */
  lastEvent: NotificationStreamEvent | null;
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

export function useNotificationStream(): UseNotificationStreamResult {
  const tokenSet = useAuthStore((s) => s.tokenSet);
  const token = tokenSet?.accessToken ?? null;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<NotificationStreamEvent | null>(null);

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
      setError(null);
      backoffRef.current = INITIAL_BACKOFF_MS; // reset back-off on success
    };

    es.addEventListener('notification', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(e.data as string) as NotificationStreamEvent['data'];
        setLastEvent({ type: 'notification', id: e.lastEventId || undefined, data: parsed });
      } catch {
        // Ignore malformed event data
      }
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      setError('Notification stream disconnected. Reconnecting…');
      es.close();
      esRef.current = null;

      // Exponential back-off reconnect
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

  return { isConnected, error, lastEvent };
}

// sse-client.ts
// Fetch-based authenticated SSE client (006-01, plan D-12). NOT EventSource:
// the Bearer token must ride the Authorization header, never the query string
// (Security §2). The ONE sanctioned exception to "api-client is the single
// fetch pipeline" — a long-lived stream, not a request/response round-trip.

import { useAuthStore } from '../stores/auth-store.js';

import { API_BASE } from './api-client.js';

import type { NotificationDto } from '../types/notification.js';

type NotificationListener = (notification: NotificationDto) => void;

/** In-memory bus for incoming SSE notification frames (Rule 3 — one pattern). */
class NotificationEventBus {
  private readonly listeners = new Set<NotificationListener>();

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(notification: NotificationDto): void {
    for (const listener of this.listeners) listener(notification);
  }
}

export const notificationEventBus = new NotificationEventBus();

const HEARTBEAT_TIMEOUT_MS = 45_000;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const MAX_JITTER_MS = 250;
const STALE_CHECK_MS = 10_000;

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * MAX_JITTER_MS);
}

export class SseClient {
  private controller: AbortController | null = null;
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private running = false;

  /** Starts the connection loop. Safe to call once per app boot (idempotent). */
  start(): void {
    if (this.running) return;
    this.running = true;
    // connect() is internally guarded so it never rejects; the catch defends a
    // future escape path that would otherwise leave the retry loop dead (B1).
    void this.connect().catch(() => {
      this.clearStaleWatchdog();
      this.scheduleRetry();
    });
  }

  /** Stops the connection loop and aborts any in-flight stream. */
  stop(): void {
    this.running = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.clearStaleWatchdog();
    this.controller?.abort();
    this.controller = null;
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken === null || accessToken.length === 0) {
      // Not authenticated yet — poll quietly for a session, then reconnect.
      this.scheduleRetry(5_000);
      return;
    }

    this.controller = new AbortController();
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/v1/notifications/stream`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: this.controller.signal,
      });
    } catch {
      // Abort (stop/stale) or network failure — both reconnect after backoff.
      this.scheduleRetry();
      return;
    }
    if (!this.running) return;

    if (response.status === 401) {
      // Token expired/revoked — back off hard and let the api-client's refresh
      // pipeline (or re-login) restore a session before reconnecting.
      this.scheduleRetry(15_000);
      return;
    }
    if (!response.ok || response.body === null) {
      this.scheduleRetry();
      return;
    }

    // Connection established — reset the backoff ladder.
    this.retryMs = INITIAL_RETRY_MS;
    this.lastActivityAt = Date.now();
    this.startStaleWatchdog();
    try {
      await this.readStream(response.body);
    } catch {
      // Stale-watchdog abort or mid-read stream error: connection is dead —
      // clear the watchdog and reconnect (previously the rejection escaped
      // connect() and killed the channel until a reload, B1).
      this.clearStaleWatchdog();
      this.scheduleRetry();
      return;
    }
    this.clearStaleWatchdog();

    // Stream ended (server closed) — reconnect.
    this.scheduleRetry();
  }

  private async readStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (this.running) {
        const { done, value } = await reader.read();
        if (done) return;
        this.lastActivityAt = Date.now();
        buffer += decoder.decode(value, { stream: true });
        buffer = this.consumeFrames(buffer);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private consumeFrames(buffer: string): string {
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      this.handleFrame(rawFrame);
      boundary = buffer.indexOf('\n\n');
    }
    return buffer;
  }

  /** Parses a single SSE frame; `event: notification` payloads are dispatched. */
  private handleFrame(rawFrame: string): void {
    if (rawFrame.trim() === ':ping' || rawFrame.startsWith(':')) return;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of rawFrame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (event !== 'notification' || dataLines.length === 0) return;
    try {
      const dto = JSON.parse(dataLines.join('\n')) as NotificationDto;
      if (typeof dto.id === 'string' && dto.id.length > 0) notificationEventBus.emit(dto);
    } catch {
      // Malformed frame — skip; the heartbeat watchdog still guards liveness.
    }
  }

  private startStaleWatchdog(): void {
    this.clearStaleWatchdog();
    this.staleTimer = setInterval(() => {
      if (Date.now() - this.lastActivityAt > HEARTBEAT_TIMEOUT_MS) {
        this.controller?.abort(new Error('SSE_HEARTBEAT_TIMEOUT'));
        this.clearStaleWatchdog();
      }
    }, STALE_CHECK_MS);
  }

  private clearStaleWatchdog(): void {
    if (this.staleTimer !== null) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private scheduleRetry(delay = jitter(this.retryMs)): void {
    if (!this.running || this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      void this.connect();
    }, delay);
  }
}

/** Singleton SSE client for the tenant web app (Rule 3 — one pattern). */
export const sseClient = new SseClient();

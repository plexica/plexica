// connection-manager.ts
// Per-tenant SSE connection pools for in-app notification delivery (ADR-035,
// feature 006-01): per-user cap, heartbeat keepalive, gauge. Schema-independent.

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

import { PendingFrameQueue } from './pending-frame-queue.js';
import { writeEvent, writeHeartbeat, writeSseHeaders } from './sse.js';

import type { ServerResponse } from 'node:http';
import type { SseFrame } from './sse.js';
import type { NotificationDto } from './types.js';

export interface ConnectionHandle {
  close(): void;
}

interface ConnectionEntry {
  res: ServerResponse;
  timer: ReturnType<typeof setInterval> | undefined;
  pending: PendingFrameQueue;
  onDrain?: () => void;
}

type UserPool = Map<string, Set<ConnectionEntry>>;

const HEARTBEAT_INTERVAL_MS = config.NOTIFICATION_SSE_HEARTBEAT_MS;
const MAX_PER_USER = config.NOTIFICATION_SSE_MAX_CONNECTIONS_PER_USER;
// Pending-frame bound per connection (~few KB) — a reader stalled past it is evicted.
const PENDING_BOUND = config.NOTIFICATION_SSE_PENDING_QUEUE_BOUND;

class ConnectionManager {
  private readonly tenants = new Map<string, UserPool>();

  /** Registers an SSE connection (per-user cap, cleanup on close/error). */
  connect(tenantSlug: string, userId: string, res: ServerResponse): ConnectionHandle {
    writeSseHeaders(res);
    const entry: ConnectionEntry = {
      res,
      timer: undefined,
      pending: new PendingFrameQueue(PENDING_BOUND, res),
    };
    const timer = setInterval(() => {
      // False heartbeat write = backpressure (buffer full), not failure; only a dead socket is evicted.
      if (res.destroyed || res.writableEnded) {
        this.evict(entry);
        return;
      }
      writeHeartbeat(res);
    }, HEARTBEAT_INTERVAL_MS);
    timer.unref();
    entry.timer = timer;

    const flushPending = (): void => entry.pending.flush();
    res.on('drain', flushPending);
    entry.onDrain = flushPending;

    const userConnections = this.userConnections(tenantSlug, userId);
    userConnections.add(entry);
    this.evictIfOverCap(tenantSlug, userId, userConnections);

    const remove = (): void => {
      if (entry.timer) clearInterval(entry.timer);
      res.removeListener('drain', flushPending);
      entry.pending.clear();
      userConnections.delete(entry);
      const pool = this.tenants.get(tenantSlug);
      if (pool?.get(userId)?.size === 0) pool.delete(userId);
      if (this.tenants.get(tenantSlug)?.size === 0) this.tenants.delete(tenantSlug);
    };
    res.on('close', remove);
    res.on('error', remove);

    logger.debug({ tenantSlug }, 'SSE connection registered');
    return { close: remove };
  }

  /**
   * Writes the notification frame to every open connection of the user. Dead
   * sockets are evicted; a backpressured write is delivered (never re-queued),
   * a drain-pending skip is queued. Returns true if any connection got the frame.
   */
  publish(tenantSlug: string, userId: string, dto: NotificationDto): boolean {
    const userConnections = this.tenants.get(tenantSlug)?.get(userId);
    if (userConnections === undefined || userConnections.size === 0) return false;
    let delivered = false;
    const stale: ConnectionEntry[] = [];
    const frame: SseFrame = { event: 'notification', data: dto };
    for (const entry of userConnections) {
      if (entry.res.destroyed || entry.res.writableEnded) {
        stale.push(entry);
        continue;
      }
      // Queued frames: append for FIFO order; otherwise write. Only a
      // drain-pending skip is queued, never a backpressured write (CodeRabbit).
      if (entry.pending.size > 0) {
        this.queueOrEvict(tenantSlug, userId, entry, frame);
        continue;
      }
      const result = writeEvent(entry.res, frame);
      if (result.written) {
        delivered = true;
      } else if (result.reason === 'drain') {
        this.queueOrEvict(tenantSlug, userId, entry, frame);
      } else {
        this.evict(entry);
      }
    }
    for (const entry of stale) this.evict(entry);
    return delivered;
  }

  /** Tenant → open connection count. Feeds the sse_active_connections gauge. */
  getGauge(): Record<string, number> {
    const gauge: Record<string, number> = {};
    for (const [tenantSlug, pool] of this.tenants) {
      let count = 0;
      for (const connections of pool.values()) count += connections.size;
      gauge[tenantSlug] = count;
    }
    return gauge;
  }

  /** Total open connections across all tenants. */
  get connectionCount(): number {
    let count = 0;
    for (const pool of this.tenants.values()) {
      for (const connections of pool.values()) count += connections.size;
    }
    return count;
  }

  private userConnections(tenantSlug: string, userId: string): Set<ConnectionEntry> {
    let pool = this.tenants.get(tenantSlug);
    if (!pool) {
      pool = new Map();
      this.tenants.set(tenantSlug, pool);
    }
    let connections = pool.get(userId);
    if (!connections) {
      connections = new Set();
      pool.set(userId, connections);
    }
    return connections;
  }

  private evictIfOverCap(
    tenantSlug: string,
    userId: string,
    connections: Set<ConnectionEntry>
  ): void {
    while (connections.size > MAX_PER_USER) {
      const oldest = connections.values().next().value as ConnectionEntry | undefined;
      if (oldest === undefined) break;
      this.evict(oldest);
      logger.warn(
        { tenantSlug, userId, code: 'SSE_CAP_EVICTED' },
        'SSE connection evicted — per-user cap reached'
      );
    }
  }

  /** Appends a frame to the connection's pending queue; evicts when at bound. */
  private queueOrEvict(
    tenantSlug: string,
    userId: string,
    entry: ConnectionEntry,
    frame: SseFrame
  ): void {
    if (entry.pending.push(frame)) return;
    this.evict(entry);
    logger.warn(
      { tenantSlug, userId, code: 'SSE_PENDING_OVERFLOW' },
      'SSE connection evicted — pending frame queue overflow'
    );
  }

  /** Removes a connection from its pool, stops its heartbeat, closes the socket. */
  private evict(entry: ConnectionEntry): void {
    if (entry.timer) clearInterval(entry.timer);
    if (entry.onDrain) entry.res.removeListener('drain', entry.onDrain);
    entry.pending.clear();
    for (const [tenantSlug, pool] of this.tenants) {
      for (const [userId, connections] of pool) {
        if (!connections.has(entry)) continue;
        connections.delete(entry);
        if (connections.size === 0) pool.delete(userId);
        if (pool.size === 0) this.tenants.delete(tenantSlug);
        if (!entry.res.destroyed && !entry.res.writableEnded) entry.res.end();
        logger.debug({ tenantSlug, userId, code: 'SSE_EVICTED' }, 'SSE connection evicted');
        return;
      }
    }
  }
}

export const connectionManager = new ConnectionManager();

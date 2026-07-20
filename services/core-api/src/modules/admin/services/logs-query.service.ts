// services/logs-query.service.ts
// Proxies admin log filters to the Loki HTTP API and returns normalized log
// entries (Spec 005, S5-A00 / Feature 005-10).
//
// Security: the LogQL string is built ONLY from values that have already been
// validated by LogsQuerySchema (tenant matches ^[a-z0-9-]+$, level matches
// ^(debug|info|warn|error)$). No raw user input is ever interpolated. The
// builder below uses template literals over these validated tokens — there is
// no code path that reaches Loki with unvalidated input.
//
// Reliability: every Loki HTTP call is guarded by AbortSignal.timeout(5000)
// (W-6 fix). A timeout surfaces as 503 LOG_QUERY_TIMEOUT so the admin UI can
// distinguish "Loki down" from "Loki slow".

import { config } from '../../../lib/config.js';
import { ServiceUnavailableError } from '../../../lib/app-error.js';

import type { PrismaClient } from '@prisma/client';
import type { LogEntry } from '../schemas/logs-schemas.js';

const LOKI_TIMEOUT_MS = 5_000;
const DEFAULT_RANGE_MS = 60 * 60 * 1_000; // 1 hour
const APP_LABEL = 'plexica-core';

interface LokiStream {
  stream?: Record<string, string>;
  values: [string, string][]; // [nsTimestamp, jsonLine]
}

interface LokiQueryRangeResponse {
  status: string;
  data?: {
    resultType?: string;
    result?: LokiStream[];
  };
}

interface ParsedLogLine {
  level?: unknown;
  tenant?: unknown;
  msg?: unknown;
  message?: unknown;
  time?: unknown;
  timestamp?: unknown;
}

export interface LogsQueryOptions {
  tenant?: string;
  level?: string;
  start?: string;
  end?: string;
  limit: number;
}

export type LogsResult = { logs: LogEntry[]; total: number };

// prisma is accepted for signature symmetry with other admin services even
// though logs live in Loki, not the tenant schema.
export async function queryLogs(
  _prisma: PrismaClient,
  options: LogsQueryOptions
): Promise<LogsResult> {
  if (!config.LOKI_URL) {
    throw new ServiceUnavailableError('Loki not configured');
  }

  const query = buildLogQL(options);
  const { startNs, endNs } = resolveRange(options);

  const url = new URL(`${config.LOKI_URL}/loki/api/v1/query_range`);
  url.searchParams.set('query', query);
  url.searchParams.set('start', startNs);
  url.searchParams.set('end', endNs);
  url.searchParams.set('limit', String(options.limit));

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(LOKI_TIMEOUT_MS) });
  } catch (error) {
    throw mapFetchError(error);
  }

  if (!response.ok) {
    throw new ServiceUnavailableError(
      `Loki responded with HTTP ${response.status}`
    );
  }

  const body = (await response.json()) as LokiQueryRangeResponse;
  const logs = parseLokiResponse(body);
  return { logs, total: logs.length };
}

// Build the LogQL string from validated tokens. Tenant and level have already
// passed regex validation in LogsQuerySchema, so they are safe to embed.
function buildLogQL(options: LogsQueryOptions): string {
  const labels: string[] = [`app="${APP_LABEL}"`];
  if (options.tenant !== undefined) {
    labels.push(`tenant="${options.tenant}"`);
  }
  const labelSelector = `{${labels.join(',')}}`;

  let logql = labelSelector;
  if (options.level !== undefined) {
    // level is constrained to debug|info|warn|error — safe to embed.
    logql += ` |~ "\\"level\\":\\"${options.level}\\""`;
  }
  return logql;
}

// Convert ISO strings to Loki nanosecond timestamps. We build string
// representations to avoid float precision loss (>2^53).
function resolveRange(
  options: LogsQueryOptions
): { startNs: string; endNs: string } {
  const endMs = options.end ? Date.parse(options.end) : Date.now();
  const startMs = options.start
    ? Date.parse(options.start)
    : endMs - DEFAULT_RANGE_MS;

  if (Number.isNaN(endMs)) {
    throw new ServiceUnavailableError('Invalid end time');
  }
  if (Number.isNaN(startMs)) {
    throw new ServiceUnavailableError('Invalid start time');
  }
  return { startNs: `${startMs}000000`, endNs: `${endMs}000000` };
}

function parseLokiResponse(body: LokiQueryRangeResponse): LogEntry[] {
  const streams = body.data?.result ?? [];
  const entries: LogEntry[] = [];
  for (const stream of streams) {
    for (const [nsTs, line] of stream.values) {
      entries.push(parseLogLine(nsTs, line));
    }
  }
  // Loki returns newest-first within a stream; sort ascending by timestamp.
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return entries;
}

function parseLogLine(nsTs: string, line: string): LogEntry {
  let parsed: ParsedLogLine = {};
  try {
    parsed = JSON.parse(line) as ParsedLogLine;
  } catch {
    return {
      timestamp: nsToIso(nsTs),
      level: 'unknown',
      tenant: null,
      message: line,
    };
  }

  const level = typeof parsed.level === 'string' ? parsed.level : 'unknown';
  const tenant = typeof parsed.tenant === 'string' ? parsed.tenant : null;
  const message =
    typeof parsed.msg === 'string'
      ? parsed.msg
      : typeof parsed.message === 'string'
        ? parsed.message
        : line;

  return {
    timestamp: nsToIso(nsTs),
    level,
    tenant,
    message,
  };
}

function nsToIso(ns: string): string {
  // ns is a string like "1700000000000000000". Take ms portion (first 13 digits).
  const ms = Number(ns.slice(0, 13));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ns;
}

function mapFetchError(error: unknown): ServiceUnavailableError {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new ServiceUnavailableError(
      'Loki query timed out after 5s',
      'LOG_QUERY_TIMEOUT'
    );
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ServiceUnavailableError(
      'Loki query aborted',
      'LOG_QUERY_TIMEOUT'
    );
  }
  return new ServiceUnavailableError(
    error instanceof Error ? error.message : 'Loki unreachable'
  );
}

// services/logs-query.service.ts
// Proxies admin log filters to the Loki HTTP API and returns normalized log
// entries (Spec 005, S5-A00 / Feature 005-10).
// Security: app and level are bounded labels. Tenant is validated, parsed from
// structured JSON, and compared exactly instead of becoming a stream label.
//
// Reliability: every Loki HTTP call is guarded by AbortSignal.timeout(5000)
// (W-6 fix). A timeout surfaces as 503 LOG_QUERY_TIMEOUT so the admin UI can
// distinguish "Loki down" from "Loki slow".

import { config } from '../../../lib/config.js';
import { ServiceUnavailableError, ValidationError } from '../../../lib/app-error.js';
import {
  LOKI_APP_LABEL,
  LOKI_LEVEL_BY_ADMIN_LEVEL,
  LOG_TENANT_SLUG_RE,
  normalizeLogLevel,
} from '../../../lib/logging-contract.js';

import type { PrismaClient } from '@prisma/client';
import type { AdminLogLevel } from '../../../lib/logging-contract.js';
import type { LogEntry } from '../schemas/logs-schemas.js';

const LOKI_TIMEOUT_MS = 5_000;
const DEFAULT_RANGE_MS = 60 * 60 * 1_000; // 1 hour

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
  level?: AdminLogLevel;
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
  url.searchParams.set('direction', 'backward');

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(LOKI_TIMEOUT_MS) });
  } catch (error) {
    throw mapFetchError(error);
  }

  if (!response.ok) {
    throw new ServiceUnavailableError(`Loki responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as LokiQueryRangeResponse;
  const logs = parseLokiResponse(body);
  return { logs, total: logs.length };
}

function buildLogQL(options: LogsQueryOptions): string {
  const labels = [`app=${JSON.stringify(LOKI_APP_LABEL)}`];
  if (options.level !== undefined) {
    labels.push(`level=${JSON.stringify(LOKI_LEVEL_BY_ADMIN_LEVEL[options.level])}`);
  }
  let logql = `{${labels.join(',')}}`;
  if (options.tenant !== undefined) {
    if (!LOG_TENANT_SLUG_RE.test(options.tenant)) {
      throw new ValidationError('tenant must be a valid tenant slug');
    }
    logql += ` | json | tenant = ${JSON.stringify(options.tenant)}`;
  }
  return logql;
}

// Convert ISO strings to Loki nanosecond timestamps. We build string
// representations to avoid float precision loss (>2^53).
function resolveRange(options: LogsQueryOptions): { startNs: string; endNs: string } {
  const endMs = options.end ? Date.parse(options.end) : Date.now();
  const startMs = options.start ? Date.parse(options.start) : endMs - DEFAULT_RANGE_MS;

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
      entries.push(parseLogLine(nsTs, line, stream.stream));
    }
  }
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

function parseLogLine(
  nsTs: string,
  line: string,
  stream: Record<string, string> | undefined
): LogEntry {
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

  const streamLevel = normalizeLogLevel(stream?.['level']);
  const level = streamLevel === 'unknown' ? normalizeLogLevel(parsed.level) : streamLevel;
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
    return new ServiceUnavailableError('Loki query timed out after 5s', 'LOG_QUERY_TIMEOUT');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ServiceUnavailableError('Loki query aborted', 'LOG_QUERY_TIMEOUT');
  }
  return new ServiceUnavailableError(error instanceof Error ? error.message : 'Loki unreachable');
}

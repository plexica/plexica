/**
 * Unit Tests: telemetry.ts + trace-context middleware
 *
 * Spec 012, T012-37 (ADR-026, ADR-013).
 *
 * telemetry.ts — tests for initTelemetry() / shutdownTelemetry() idempotency
 *   and fail-open behaviour when the OTel SDK throws.
 *
 * trace-context.ts — tests for the Fastify onRequest hook: traceparent parsing,
 *   ID generation, logger binding, and response header injection.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ===========================================================================
// SECTION A — telemetry.ts
// ===========================================================================

// ---------------------------------------------------------------------------
// Hoist mock factories
// ---------------------------------------------------------------------------

const { mockSdkStart, mockSdkShutdown, mockBatchSpanProcessor } = vi.hoisted(() => {
  const mockSdkStart = vi.fn();
  const mockSdkShutdown = vi.fn().mockResolvedValue(undefined);
  const mockBatchSpanProcessor = vi.fn();
  return { mockSdkStart, mockSdkShutdown, mockBatchSpanProcessor };
});

// ---------------------------------------------------------------------------
// Mock OTel SDK — keep it lightweight so we never touch gRPC
// ---------------------------------------------------------------------------

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: mockSdkStart,
    shutdown: mockSdkShutdown,
  })),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  BatchSpanProcessor: mockBatchSpanProcessor.mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  TraceIdRatioBasedSampler: vi.fn().mockImplementation(() => ({})),
  ParentBasedSampler: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/core', () => ({
  W3CTraceContextPropagator: vi.fn().mockImplementation(() => ({})),
  CompositePropagator: vi.fn().mockImplementation(() => ({})),
  W3CBaggagePropagator: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

// ---------------------------------------------------------------------------
// Tests — telemetry
// ---------------------------------------------------------------------------

describe('telemetry — initTelemetry()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call sdk.start() on the first call', async () => {
    // Re-import to get a fresh module state (vi.resetModules clears the module cache)
    vi.resetModules();
    const { initTelemetry } = await import('../../../lib/telemetry.js');
    initTelemetry();
    expect(mockSdkStart).toHaveBeenCalledTimes(1);
  });

  it('should be idempotent — second call is a no-op (sdk.start not called again)', async () => {
    vi.resetModules();
    const { initTelemetry } = await import('../../../lib/telemetry.js');
    initTelemetry();
    initTelemetry();
    expect(mockSdkStart).toHaveBeenCalledTimes(1);
  });

  it('should fail-open when sdk.start() throws (no error propagated)', async () => {
    vi.resetModules();
    mockSdkStart.mockImplementationOnce(() => {
      throw new Error('OTel unavailable');
    });
    const { initTelemetry } = await import('../../../lib/telemetry.js');
    expect(() => initTelemetry()).not.toThrow();
  });
});

describe('telemetry — shutdownTelemetry()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call sdk.shutdown() after a successful initTelemetry()', async () => {
    vi.resetModules();
    const { initTelemetry, shutdownTelemetry } = await import('../../../lib/telemetry.js');
    initTelemetry();
    await shutdownTelemetry();
    expect(mockSdkShutdown).toHaveBeenCalledTimes(1);
  });

  it('should be a no-op when sdk was never initialised', async () => {
    vi.resetModules();
    const { shutdownTelemetry } = await import('../../../lib/telemetry.js');
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
    expect(mockSdkShutdown).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION B — trace-context middleware
// ===========================================================================

vi.mock('@opentelemetry/api', () => ({
  context: {
    active: vi.fn().mockReturnValue({}),
    with: vi.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
  },
  propagation: {
    extract: vi.fn().mockReturnValue({}),
  },
  trace: {
    getSpan: vi.fn().mockReturnValue(null),
  },
  ROOT_CONTEXT: {},
}));

import { traceContextMiddleware } from '../../../middleware/trace-context.js';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

function makeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return {
    headers,
    log: {
      child: vi.fn().mockReturnThis(),
    },
  } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  return {
    header: vi.fn(),
  } as unknown as FastifyReply;
}

describe('traceContextMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call done() to not block the request', () => {
    const req = makeRequest();
    const reply = makeReply();
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    traceContextMiddleware(req, reply, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('should inject traceId and spanId into request logger bindings', () => {
    const req = makeRequest();
    const reply = makeReply();
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    traceContextMiddleware(req, reply, done);
    expect((req.log as unknown as { child: ReturnType<typeof vi.fn> }).child).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: expect.any(String), spanId: expect.any(String) })
    );
  });

  it('should set a traceparent response header', () => {
    const req = makeRequest();
    const reply = makeReply();
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    traceContextMiddleware(req, reply, done);
    expect((reply as unknown as { header: ReturnType<typeof vi.fn> }).header).toHaveBeenCalledWith(
      'traceparent',
      expect.stringMatching(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
    );
  });

  it('should reuse traceId and spanId from a valid incoming traceparent header', () => {
    const traceId = 'aabbccddeeff00112233445566778899';
    const spanId = '1122334455667788';
    const req = makeRequest({
      traceparent: `00-${traceId}-${spanId}-01`,
    });
    const reply = makeReply();
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    traceContextMiddleware(req, reply, done);
    expect((reply as unknown as { header: ReturnType<typeof vi.fn> }).header).toHaveBeenCalledWith(
      'traceparent',
      `00-${traceId}-${spanId}-01`
    );
  });

  it('should generate new IDs when traceparent header is absent', () => {
    const req = makeRequest();
    const reply = makeReply();
    const done = vi.fn() as unknown as HookHandlerDoneFunction;
    traceContextMiddleware(req, reply, done);
    const [[, headerValue]] = (
      (reply as unknown as { header: ReturnType<typeof vi.fn> }).header as ReturnType<typeof vi.fn>
    ).mock.calls as [[string, string]];
    const parts = headerValue.split('-');
    expect(parts[1]).toHaveLength(32);
    expect(parts[2]).toHaveLength(16);
  });
});

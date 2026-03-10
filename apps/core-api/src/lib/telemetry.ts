/**
 * OpenTelemetry Initialisation — core-api
 *
 * Spec 012, Task T012-12 (ADR-026).
 *
 * IMPORTANT: This module MUST be imported before any other application code
 * (i.e. as the very first import in index.ts) so that the OTel SDK can patch
 * http/net/dns modules before they are first required by the application.
 *
 * Configuration:
 *   - Exporter:   OTLP/gRPC → Grafana Tempo (OTEL_EXPORTER_OTLP_ENDPOINT)
 *   - Propagator: W3C TraceContext + Baggage (ADR-026)
 *   - Sampling:   head-based — 100% in dev/test, 10% in production (ADR-026)
 *   - Processor:  BatchSpanProcessor with fail-open semantics
 *
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — gRPC endpoint, e.g. http://tempo:4317 (default)
 *   OTEL_SERVICE_NAME            — service name label (default: plexica-core-api)
 *   NODE_ENV                     — 'production' activates 10% sampling
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator, W3CBaggagePropagator } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'plexica-core-api';
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://tempo:4317';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Head-based sampling: 10% in production, 100% elsewhere (ADR-026).
const SAMPLE_RATIO = IS_PRODUCTION ? 0.1 : 1.0;

let sdk: NodeSDK | null = null;

/**
 * Initialise the OpenTelemetry SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Fail-open: if the SDK fails to start (e.g. Tempo unreachable at startup),
 * the error is logged but the application continues without tracing.
 */
export function initTelemetry(): void {
  if (sdk !== null) return;

  const exporter = new OTLPTraceExporter({ url: OTLP_ENDPOINT });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
    }),
    spanProcessor: new BatchSpanProcessor(exporter, {
      // Fail-open: export failures do not throw; the BatchSpanProcessor drops
      // spans that cannot be exported rather than crashing the application.
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(SAMPLE_RATIO),
    }),
    textMapPropagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
    // Instrument Node.js HTTP and Fastify so that incoming requests and
    // outbound HTTP calls automatically produce spans. These packages are
    // already listed in package.json; they are registered here rather than
    // via auto-instrumentation to keep the setup explicit (ADR-026).
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
  });

  try {
    sdk.start();
    console.info(
      `[telemetry] OpenTelemetry initialised — service=${SERVICE_NAME} endpoint=${OTLP_ENDPOINT} sampleRatio=${SAMPLE_RATIO}`
    );
  } catch (err) {
    // Fail-open: tracing unavailability must never crash the application.
    console.error('[telemetry] Failed to start OpenTelemetry SDK (traces disabled):', err);
    sdk = null;
  }
}

/**
 * Gracefully shut down the OTel SDK, flushing pending spans.
 * Called from the application's SIGTERM/SIGINT handler.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk === null) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error('[telemetry] Error during OTel SDK shutdown:', err);
  }
}

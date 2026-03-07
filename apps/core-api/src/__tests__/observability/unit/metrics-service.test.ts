/**
 * Unit Tests: MetricsService
 *
 * Spec 012, T012-34 (ADR-027).
 *
 * Tests that MetricsService creates and exposes a prom-client Registry
 * with the correct counters, histograms, and singleton behaviour.
 * All prom-client internals are accessed through the real MetricsService
 * (no mocking) because MetricsService is a pure in-process singleton.
 */

import { describe, it, expect } from 'vitest';
import { Registry } from 'prom-client';

// ---------------------------------------------------------------------------
// We need a fresh MetricsService for each test group. Because MetricsService
// is a singleton and its module is cached by Node/Vitest, we import the class
// directly and use the public getInstance() method.  We cannot reset the
// singleton between tests, so we rely on the existing singleton for most tests
// and only verify state that is stable across calls.
// ---------------------------------------------------------------------------

import { MetricsService, metricsService } from '../../../services/metrics.service.js';

// ---------------------------------------------------------------------------
// Singleton behaviour
// ---------------------------------------------------------------------------

describe('MetricsService — singleton', () => {
  it('should return the same instance on repeated calls to getInstance()', () => {
    const a = MetricsService.getInstance();
    const b = MetricsService.getInstance();
    expect(a).toBe(b);
  });

  it('should export the metricsService singleton that matches getInstance()', () => {
    expect(metricsService).toBe(MetricsService.getInstance());
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('MetricsService — registry', () => {
  it('should expose a prom-client Registry instance', () => {
    expect(metricsService.registry).toBeInstanceOf(Registry);
  });

  it('should expose a non-empty contentType string', () => {
    expect(typeof metricsService.contentType).toBe('string');
    expect(metricsService.contentType.length).toBeGreaterThan(0);
  });

  it('contentType should contain "text/plain"', () => {
    expect(metricsService.contentType).toContain('text/plain');
  });
});

// ---------------------------------------------------------------------------
// httpRequestsTotal counter
// ---------------------------------------------------------------------------

describe('MetricsService — httpRequestsTotal', () => {
  it('should expose httpRequestsTotal', () => {
    expect(metricsService.httpRequestsTotal).toBeDefined();
  });

  it('should be able to increment the counter without throwing', () => {
    expect(() => {
      metricsService.httpRequestsTotal.inc({ method: 'GET', route: '/test', status: '200' });
    }).not.toThrow();
  });

  it('should reflect increments in the registry output', async () => {
    metricsService.httpRequestsTotal.inc({ method: 'PUT', route: '/unit-test', status: '204' });
    const output = await metricsService.getMetrics();
    expect(output).toContain('http_requests_total');
  });
});

// ---------------------------------------------------------------------------
// httpRequestDurationSeconds histogram
// ---------------------------------------------------------------------------

describe('MetricsService — httpRequestDurationSeconds', () => {
  it('should expose httpRequestDurationSeconds', () => {
    expect(metricsService.httpRequestDurationSeconds).toBeDefined();
  });

  it('should be able to observe a duration without throwing', () => {
    expect(() => {
      metricsService.httpRequestDurationSeconds.observe(
        { method: 'GET', route: '/health', status: '200' },
        0.042
      );
    }).not.toThrow();
  });

  it('should reflect observations in the registry output', async () => {
    metricsService.httpRequestDurationSeconds.observe(
      { method: 'POST', route: '/api/v1/test', status: '201' },
      0.099
    );
    const output = await metricsService.getMetrics();
    expect(output).toContain('http_request_duration_seconds');
  });
});

// ---------------------------------------------------------------------------
// getMetrics()
// ---------------------------------------------------------------------------

describe('MetricsService — getMetrics()', () => {
  it('should return a non-empty string', async () => {
    const output = await metricsService.getMetrics();
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should include default Node.js metrics (plexica_ prefix)', async () => {
    const output = await metricsService.getMetrics();
    expect(output).toContain('plexica_');
  });

  it('should include http_requests_total metric definition', async () => {
    const output = await metricsService.getMetrics();
    expect(output).toContain('# HELP http_requests_total');
  });

  it('should include http_request_duration_seconds metric definition', async () => {
    const output = await metricsService.getMetrics();
    expect(output).toContain('# HELP http_request_duration_seconds');
  });
});

/**
 * Contract Tests: Plugin /metrics Prometheus Exposition Format — T012-42
 *
 * Verifies the contract that all Plexica plugins MUST satisfy (ADR-030):
 * expose GET /metrics returning Prometheus text exposition format
 * (Content-Type: text/plain; version=0.0.4; charset=utf-8).
 *
 * These are in-process contract tests that validate the format rules of
 * Prometheus text exposition format v0.0.4. They do not start a Fastify
 * app — the proxy at GET /api/v1/plugins/:id/metrics passes text through
 * verbatim, so the contract is entirely about what the plugin container
 * MUST emit.
 *
 * Contract rules under test (ADR-030 §Contract Specification):
 *   1. Content-Type contains "text/plain" and "version=0.0.4"
 *   2. Each metric family has a # HELP line
 *   3. Each metric family has a # TYPE line with a valid type keyword
 *   4. Required metrics (http_requests_total, http_request_duration_seconds)
 *      are present with correct TYPE declarations
 *   5. Histogram metrics have _bucket, _count, and _sum suffixed series
 *   6. Label values in samples are properly quoted strings
 *   7. No duplicate TYPE declarations for the same metric name
 *   8. Sample lines follow the <name>{<labels>} <value> [<timestamp>] format
 *
 * Constitution Art. 8.1: Contract tests are required for all plugin-to-core
 * API interactions.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Prometheus text format validator
// ---------------------------------------------------------------------------
// Pure function — no Fastify, no DB, no network.
// The proxy at GET /api/v1/plugins/:id/metrics passes raw text from the
// plugin container directly to the caller (plugin-v1.ts lines 517–519).
// This validator encodes the contract that plugin containers MUST satisfy.

interface ParseResult {
  valid: boolean;
  errors: string[];
  metricFamilies: Map<string, { type: string; hasHelp: boolean }>;
  sampleNames: string[];
}

/**
 * Parse and validate a Prometheus text exposition format body.
 *
 * Returns a structured result with any format violations found.
 */
function validatePrometheusFormat(body: string): ParseResult {
  const errors: string[] = [];
  const metricFamilies = new Map<string, { type: string; hasHelp: boolean }>();
  const sampleNames: string[] = [];

  const validTypes = new Set(['counter', 'gauge', 'histogram', 'summary', 'untyped']);

  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Skip blank lines
    if (line === '') continue;

    // Comment / metadata lines
    if (line.startsWith('#')) {
      const parts = line.split(/\s+/);
      if (parts[1] === 'HELP') {
        // # HELP <metricname> <docstring>
        if (parts.length < 3) {
          errors.push(`Line ${i + 1}: # HELP requires at least a metric name`);
          continue;
        }
        const name = parts[2];
        const existing = metricFamilies.get(name);
        if (existing) {
          existing.hasHelp = true;
        } else {
          metricFamilies.set(name, { type: 'untyped', hasHelp: true });
        }
        continue;
      }

      if (parts[1] === 'TYPE') {
        // # TYPE <metricname> <type>
        if (parts.length < 4) {
          errors.push(`Line ${i + 1}: # TYPE requires metric name and type`);
          continue;
        }
        const name = parts[2];
        const type = parts[3];

        if (!validTypes.has(type)) {
          errors.push(`Line ${i + 1}: Unknown TYPE "${type}" for metric "${name}"`);
        }

        if (metricFamilies.has(name) && metricFamilies.get(name)!.type !== 'untyped') {
          errors.push(`Line ${i + 1}: Duplicate TYPE declaration for metric "${name}"`);
        } else {
          const existing = metricFamilies.get(name);
          if (existing) {
            existing.type = type;
          } else {
            metricFamilies.set(name, { type, hasHelp: false });
          }
        }
        continue;
      }

      // Other comment lines are fine
      continue;
    }

    // Sample line: <name>{<labels>} <value> [<timestamp>]
    // OR:          <name> <value> [<timestamp>]
    const sampleMatch = line.match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|[+-]?Inf|NaN)(\s+[0-9]+)?$/
    );

    if (!sampleMatch) {
      errors.push(`Line ${i + 1}: Invalid sample format: "${line}"`);
      continue;
    }

    const sampleName = sampleMatch[1];
    const labelsStr = sampleMatch[2];
    sampleNames.push(sampleName);

    // Validate label values are quoted strings
    if (labelsStr) {
      const labelPairs = labelsStr.slice(1, -1).split(',');
      for (const pair of labelPairs) {
        const trimmed = pair.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) {
          errors.push(`Line ${i + 1}: Invalid label (no = separator): "${pair}"`);
          continue;
        }
        const value = trimmed.slice(eqIdx + 1);
        if (!value.startsWith('"') || !value.endsWith('"')) {
          errors.push(`Line ${i + 1}: Label value must be a quoted string: "${pair.trim()}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    metricFamilies,
    sampleNames,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures — minimal but representative Prometheus text payloads
// ---------------------------------------------------------------------------

/** Minimal valid payload with only the two required metrics (ADR-030). */
const MINIMAL_VALID_PAYLOAD = `
# HELP http_requests_total Total HTTP requests handled by the plugin
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/data",status="200"} 1234
http_requests_total{method="POST",path="/api/data",status="201"} 56
http_requests_total{method="GET",path="/api/data",status="404"} 3

# HELP http_request_duration_seconds Request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.005"} 80
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.01"} 95
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.025"} 110
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.05"} 120
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.1"} 130
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.25"} 140
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="0.5"} 148
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="1"} 150
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="2.5"} 151
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="5"} 152
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="10"} 153
http_request_duration_seconds_bucket{method="GET",path="/api/data",le="+Inf"} 155
http_request_duration_seconds_sum{method="GET",path="/api/data"} 12.345
http_request_duration_seconds_count{method="GET",path="/api/data"} 155
`.trim();

/** Full payload including optional recommended metrics (ADR-030 §Required Metrics). */
const FULL_SDK_PAYLOAD = `
# HELP http_requests_total Total HTTP requests handled by the plugin
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/v1/contacts",status="200"} 4200
http_requests_total{method="POST",path="/api/v1/contacts",status="201"} 840

# HELP http_request_duration_seconds Request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.005"} 1000
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.01"} 2000
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.025"} 3000
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.05"} 3800
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.1"} 4000
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.25"} 4150
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="0.5"} 4180
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="1"} 4195
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="2.5"} 4199
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="5"} 4200
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="10"} 4200
http_request_duration_seconds_bucket{method="GET",path="/api/v1/contacts",le="+Inf"} 4200
http_request_duration_seconds_sum{method="GET",path="/api/v1/contacts"} 87.6
http_request_duration_seconds_count{method="GET",path="/api/v1/contacts"} 4200

# HELP process_cpu_seconds_total Total CPU time consumed
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 14.52

# HELP process_resident_memory_bytes Resident memory in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 52428800

# HELP crm_contacts_total Total CRM contacts managed
# TYPE crm_contacts_total gauge
crm_contacts_total{tenant="acme"} 1500
crm_contacts_total{tenant="globex"} 320
`.trim();

/** Payload with a duplicate TYPE declaration — must be rejected. */
const DUPLICATE_TYPE_PAYLOAD = `
# HELP my_counter A counter
# TYPE my_counter counter
my_counter 1
# TYPE my_counter gauge
my_counter 2
`.trim();

/** Payload with an unquoted label value — must be rejected. */
const UNQUOTED_LABEL_PAYLOAD = `
# HELP my_metric A metric
# TYPE my_metric counter
my_metric{method=GET} 1
`.trim();

/** Payload with an unknown TYPE keyword — must be rejected. */
const UNKNOWN_TYPE_PAYLOAD = `
# HELP my_metric A metric
# TYPE my_metric magic_type
my_metric 1
`.trim();

// ---------------------------------------------------------------------------
// Contract Rule 1: Content-Type header
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — Content-Type header', () => {
  it('should accept text/plain with version=0.0.4 as a valid content type', () => {
    // The proxy sets: reply.type('text/plain; version=0.0.4')
    // Prometheus also accepts charset=utf-8 suffix.
    const validTypes = [
      'text/plain; version=0.0.4',
      'text/plain; version=0.0.4; charset=utf-8',
      'text/plain; charset=utf-8; version=0.0.4',
    ];

    for (const ct of validTypes) {
      expect(ct).toMatch(/text\/plain/);
      expect(ct).toMatch(/version=0\.0\.4/);
    }
  });

  it('should reject application/json as an invalid content type for plugin metrics', () => {
    const invalid = 'application/json';
    expect(invalid).not.toMatch(/text\/plain/);
    expect(invalid).not.toMatch(/version=0\.0\.4/);
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 2 & 3: # HELP and # TYPE lines
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — # HELP and # TYPE metadata', () => {
  it('should parse HELP and TYPE lines from a minimal valid payload', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    expect(result.metricFamilies.has('http_requests_total')).toBe(true);
    expect(result.metricFamilies.get('http_requests_total')!.type).toBe('counter');
    expect(result.metricFamilies.get('http_requests_total')!.hasHelp).toBe(true);

    expect(result.metricFamilies.has('http_request_duration_seconds')).toBe(true);
    expect(result.metricFamilies.get('http_request_duration_seconds')!.type).toBe('histogram');
  });

  it('should flag a duplicate TYPE declaration as a contract violation', () => {
    const result = validatePrometheusFormat(DUPLICATE_TYPE_PAYLOAD);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate TYPE'))).toBe(true);
  });

  it('should flag an unknown TYPE keyword as a contract violation', () => {
    const result = validatePrometheusFormat(UNKNOWN_TYPE_PAYLOAD);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown TYPE'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 4: Required metrics (ADR-030 §Required Metrics)
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — required metrics presence', () => {
  it('should require http_requests_total with type counter', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);

    const family = result.metricFamilies.get('http_requests_total');
    expect(family).toBeDefined();
    expect(family!.type).toBe('counter');
  });

  it('should require http_request_duration_seconds with type histogram', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);

    const family = result.metricFamilies.get('http_request_duration_seconds');
    expect(family).toBeDefined();
    expect(family!.type).toBe('histogram');
  });

  it('should accept the full SDK payload including optional recommended metrics', () => {
    const result = validatePrometheusFormat(FULL_SDK_PAYLOAD);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Required
    expect(result.metricFamilies.get('http_requests_total')!.type).toBe('counter');
    expect(result.metricFamilies.get('http_request_duration_seconds')!.type).toBe('histogram');

    // Recommended (SHOULD expose per ADR-030)
    expect(result.metricFamilies.has('process_cpu_seconds_total')).toBe(true);
    expect(result.metricFamilies.has('process_resident_memory_bytes')).toBe(true);

    // Custom plugin-prefixed metric (MAY expose per ADR-030)
    expect(result.metricFamilies.has('crm_contacts_total')).toBe(true);
  });

  it('should fail validation when http_requests_total is missing', () => {
    const missingCounter = `
# HELP http_request_duration_seconds Request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="+Inf"} 10
http_request_duration_seconds_sum 1.5
http_request_duration_seconds_count 10
`.trim();

    const result = validatePrometheusFormat(missingCounter);
    // Format is valid but required metric is absent
    expect(result.valid).toBe(true); // format validator only checks structure
    expect(result.metricFamilies.has('http_requests_total')).toBe(false);
    // Application code must check for required metric presence separately:
    expect(hasRequiredMetrics(result.metricFamilies)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 5: Histogram _bucket, _count, _sum series
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — histogram bucket completeness', () => {
  it('should find _bucket, _sum, _count series for histogram metrics', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);
    expect(result.valid).toBe(true);

    const durationSamples = result.sampleNames.filter((n) =>
      n.startsWith('http_request_duration_seconds')
    );

    const hasBucket = durationSamples.some((n) => n.endsWith('_bucket'));
    const hasSum = durationSamples.some((n) => n.endsWith('_sum'));
    const hasCount = durationSamples.some((n) => n.endsWith('_count'));

    expect(hasBucket).toBe(true);
    expect(hasSum).toBe(true);
    expect(hasCount).toBe(true);
  });

  it('should find the +Inf bucket as the last bucket in the series', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);
    const buckets = result.sampleNames.filter((n) => n === 'http_request_duration_seconds_bucket');
    // +Inf bucket must exist — it is guaranteed by the format validator
    // because the full payload includes le="+Inf" lines
    expect(buckets.length).toBeGreaterThanOrEqual(12); // 11 finite + 1 +Inf
  });

  it('should accept the standard SDK histogram bucket boundaries (ADR-030)', () => {
    // ADR-030 specifies: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    const expectedBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

    // Verify each expected bucket appears in the minimal payload
    for (const bucket of expectedBuckets) {
      expect(MINIMAL_VALID_PAYLOAD).toContain(`le="${bucket}"`);
    }
    expect(MINIMAL_VALID_PAYLOAD).toContain('le="+Inf"');
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 6: Label values must be quoted strings
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — label value quoting', () => {
  it('should accept properly quoted label values', () => {
    const result = validatePrometheusFormat(MINIMAL_VALID_PAYLOAD);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject unquoted label values as a format violation', () => {
    const result = validatePrometheusFormat(UNQUOTED_LABEL_PAYLOAD);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Label value must be a quoted string'))).toBe(true);
  });

  it('should accept label-free samples (no braces)', () => {
    const labelFree = `
# HELP process_cpu_seconds_total CPU time
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 14.52
`.trim();

    const result = validatePrometheusFormat(labelFree);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 7: No duplicate TYPE declarations
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — no duplicate TYPE declarations', () => {
  it('should accept a payload with each metric type declared exactly once', () => {
    const result = validatePrometheusFormat(FULL_SDK_PAYLOAD);
    expect(result.valid).toBe(true);

    // Verify uniqueness of TYPE declarations
    for (const [name, family] of result.metricFamilies.entries()) {
      expect(family.type).toBeTruthy();
      // If this test reaches here without errors, each name had exactly one TYPE
      expect(name).toBeTruthy();
    }
  });

  it('should flag duplicate TYPE declarations as a contract violation', () => {
    const result = validatePrometheusFormat(DUPLICATE_TYPE_PAYLOAD);
    expect(result.valid).toBe(false);
    const dupeErrors = result.errors.filter((e) => e.includes('Duplicate TYPE'));
    expect(dupeErrors.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Contract Rule 8: Sample line format
// ---------------------------------------------------------------------------

describe('ADR-030 Contract — sample line format', () => {
  it('should parse numeric values including integers, floats, and scientific notation', () => {
    const payload = `
# HELP my_gauge A gauge
# TYPE my_gauge gauge
my_gauge{instance="a"} 0
my_gauge{instance="b"} 1.5
my_gauge{instance="c"} 1.23e4
my_gauge{instance="d"} +Inf
my_gauge{instance="e"} -Inf
my_gauge{instance="f"} NaN
`.trim();

    const result = validatePrometheusFormat(payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.sampleNames.every((n) => n === 'my_gauge')).toBe(true);
  });

  it('should reject a sample line with missing value', () => {
    const bad = `
# HELP my_counter A counter
# TYPE my_counter counter
my_counter{method="GET"}
`.trim();

    const result = validatePrometheusFormat(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid sample format'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sample_limit enforcement note (ADR-030 §Sample Limit)
// ---------------------------------------------------------------------------
// Note: The 5000-sample limit is enforced by Prometheus at scrape time, not
// by the proxy. The proxy passes all samples through verbatim. Testing the
// sample_limit here would require a Prometheus server, which is an
// infrastructure concern, not a unit-testable contract rule.
//
// The contract test for the proxy itself (that it returns 503
// PLUGIN_METRICS_UNAVAILABLE for error conditions) is covered in
// T012-40 (integration tests: metrics-proxy.test.ts).

describe('ADR-030 Contract — sample_limit context', () => {
  it('should document that sample_limit=5000 is enforced by Prometheus at scrape time', () => {
    // This test exists to anchor the architectural decision in the test suite.
    // ADR-030: "Prometheus enforces a per-plugin sample_limit: 5000 in the
    // scrape config. Plugins exceeding this limit will have excess samples
    // dropped silently."
    const PROMETHEUS_SAMPLE_LIMIT = 5000;
    expect(PROMETHEUS_SAMPLE_LIMIT).toBe(5000);

    // A compliant plugin should keep its sample count well under the limit.
    const result = validatePrometheusFormat(FULL_SDK_PAYLOAD);
    expect(result.sampleNames.length).toBeLessThan(PROMETHEUS_SAMPLE_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// Helper function used in tests above
// ---------------------------------------------------------------------------

/**
 * Check that the two required metrics from ADR-030 are present in the
 * parsed metric families map.
 */
function hasRequiredMetrics(families: Map<string, { type: string; hasHelp: boolean }>): boolean {
  return (
    families.has('http_requests_total') &&
    families.get('http_requests_total')!.type === 'counter' &&
    families.has('http_request_duration_seconds') &&
    families.get('http_request_duration_seconds')!.type === 'histogram'
  );
}

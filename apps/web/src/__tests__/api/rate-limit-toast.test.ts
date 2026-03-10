// apps/web/src/__tests__/api/rate-limit-toast.test.ts
//
// Unit tests for the onRateLimited toast handler wired in
// apps/web/src/lib/api-client.ts (Spec 016, T016-05e).
//
// Covers:
//   AC-04 — onRateLimited triggers a Sonner toast with the wait time
//   AC-05 — toast duration is capped at 10 seconds
//   AC-06 — concurrent 429s produce only one toast (Sonner id deduplication)
//   AC-07 — retryAfter=0 is floored to 1 second (no "0 seconds" message)
//   AC-08 — singular "second" for retryAfter=1, plural "seconds" for retryAfter>1
//
// Constitution Art. 4.1 — ≥80% coverage; Art. 8.1 — unit tests required.
// Constitution Art. 1.3 — actionable user-facing error messages.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted() — declare shared mocks BEFORE vi.mock() factories are hoisted.
// Vitest hoists vi.mock() calls to the top of the file at transform time, so
// any variables they reference must also be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

type OnRateLimited = (retryAfter: number) => void;

const { mockToastWarning, capturedCallbacks } = vi.hoisted(() => ({
  mockToastWarning: vi.fn() as ReturnType<typeof vi.fn>,
  capturedCallbacks: {} as { tenant?: OnRateLimited; adminWeb?: OnRateLimited },
}));

// ---------------------------------------------------------------------------
// Mock Sonner toast before any module imports
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: {
    warning: mockToastWarning,
  },
}));

// ---------------------------------------------------------------------------
// Mock @plexica/api-client so we can capture the onRateLimited callback
// without making real HTTP connections.
//
// We intercept the TenantApiClient and AdminApiClient constructors, save the
// onRateLimited option, and expose it via capturedCallbacks for inspection.
// ---------------------------------------------------------------------------

vi.mock('@plexica/api-client', () => {
  class FakeTenantApiClient {
    constructor(config: { onRateLimited?: OnRateLimited }) {
      capturedCallbacks.tenant = config.onRateLimited;
    }
    setAuthProvider() {}
    clearContext() {}
  }
  class FakeAdminApiClient {
    constructor(config: { onRateLimited?: OnRateLimited }) {
      capturedCallbacks.adminWeb = config.onRateLimited;
    }
    setAuthProvider() {}
    clearAuth() {}
  }
  return {
    TenantApiClient: FakeTenantApiClient,
    AdminApiClient: FakeAdminApiClient,
  };
});

// Import the module under test AFTER the mocks are registered.
// The side-effect of the import instantiates WebApiClient and WebAdminApiClient,
// which runs the constructors and populates capturedCallbacks.
import '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callTenantRateLimited(retryAfter: number) {
  capturedCallbacks.tenant!(retryAfter);
}

function callAdminRateLimited(retryAfter: number) {
  capturedCallbacks.adminWeb!(retryAfter);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebApiClient — onRateLimited toast (AC-04, AC-05, AC-06, AC-07, AC-08)', () => {
  beforeEach(() => {
    mockToastWarning.mockClear();
  });

  it('AC-04: should show a Sonner warning toast when rate limited (tenant client)', () => {
    // Arrange + Act
    callTenantRateLimited(30);

    // Assert
    expect(mockToastWarning).toHaveBeenCalledOnce();
    const [message] = mockToastWarning.mock.calls[0] as [string, unknown];
    expect(message).toContain('30');
  });

  it('AC-05: should cap toast duration at 10 000 ms for large retryAfter values', () => {
    // Arrange + Act — retryAfter=120 → uncapped = 120 000ms → should be capped at 10 000
    callTenantRateLimited(120);

    // Assert
    const [, options] = mockToastWarning.mock.calls[0] as [string, { duration: number }];
    expect(options.duration).toBe(10_000);
  });

  it('AC-05: should use retryAfter*1000 as duration when below 10 000 ms cap', () => {
    // Arrange + Act — retryAfter=5 → duration = 5 000ms
    callTenantRateLimited(5);

    // Assert
    const [, options] = mockToastWarning.mock.calls[0] as [string, { duration: number }];
    expect(options.duration).toBe(5_000);
  });

  it('AC-06: should set Sonner id to deduplicate concurrent toasts', () => {
    // Arrange + Act — fire twice
    callTenantRateLimited(10);
    callTenantRateLimited(10);

    // Assert — both calls use id: 'rate-limit-toast' so Sonner deduplicates them
    const calls = mockToastWarning.mock.calls as Array<[string, { id?: string }]>;
    expect(calls[0][1]).toMatchObject({ id: 'rate-limit-toast' });
    expect(calls[1][1]).toMatchObject({ id: 'rate-limit-toast' });
  });

  it('AC-07: should floor retryAfter=0 to 1 second (no zero-delay message)', () => {
    // Arrange + Act
    callTenantRateLimited(0);

    // Assert — message must not say "0 seconds"
    const [message, options] = mockToastWarning.mock.calls[0] as [
      string,
      { duration: number; id: string },
    ];
    expect(message).not.toContain('0 second');
    expect(message).toContain('1 second');
    // Duration must also be at least 1 000ms
    expect(options.duration).toBeGreaterThanOrEqual(1_000);
  });

  it('AC-08: should use singular "second" for retryAfter=1', () => {
    callTenantRateLimited(1);
    const [message] = mockToastWarning.mock.calls[0] as [string];
    expect(message).toContain('1 second');
    expect(message).not.toContain('1 seconds');
  });

  it('AC-08: should use plural "seconds" for retryAfter=2', () => {
    callTenantRateLimited(2);
    const [message] = mockToastWarning.mock.calls[0] as [string];
    expect(message).toContain('2 seconds');
  });
});

describe('WebAdminApiClient — onRateLimited toast (AC-04, AC-05, AC-06, AC-07, AC-08)', () => {
  beforeEach(() => {
    mockToastWarning.mockClear();
  });

  it('AC-04: should show a Sonner warning toast when rate limited (admin-web client)', () => {
    callAdminRateLimited(30);

    expect(mockToastWarning).toHaveBeenCalledOnce();
    const [message] = mockToastWarning.mock.calls[0] as [string, unknown];
    expect(message).toContain('30');
  });

  it('AC-05: should cap toast duration at 10 000 ms', () => {
    callAdminRateLimited(120);
    const [, options] = mockToastWarning.mock.calls[0] as [string, { duration: number }];
    expect(options.duration).toBe(10_000);
  });

  it('AC-06: should set Sonner id to deduplicate concurrent toasts', () => {
    callAdminRateLimited(5);
    const [, options] = mockToastWarning.mock.calls[0] as [string, { id?: string }];
    expect(options).toMatchObject({ id: 'rate-limit-toast' });
  });

  it('AC-07: should floor retryAfter=0 to 1 second', () => {
    callAdminRateLimited(0);
    const [message, options] = mockToastWarning.mock.calls[0] as [string, { duration: number }];
    expect(message).not.toContain('0 second');
    expect(options.duration).toBeGreaterThanOrEqual(1_000);
  });

  it('AC-08: should use singular "second" for retryAfter=1', () => {
    callAdminRateLimited(1);
    const [message] = mockToastWarning.mock.calls[0] as [string];
    expect(message).toContain('1 second');
    expect(message).not.toContain('1 seconds');
  });
});

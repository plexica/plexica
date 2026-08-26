import { describe, expect, it, vi } from 'vitest';

import {
  SIDECAR_PROBE_INTERVAL_MS,
  SIDECAR_PROBE_MAX_ATTEMPTS,
  probeSidecarEndpoint,
} from '../../modules/plugin/services/sidecar-readiness-probe.js';

function connectionRefused(): TypeError {
  const cause = Object.assign(new Error('connect ECONNREFUSED'), {
    code: 'ECONNREFUSED',
  });
  return new TypeError('fetch failed', { cause });
}

describe('probeSidecarEndpoint', () => {
  it('retries a connection refusal and succeeds on the second attempt', async () => {
    const delayImpl = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(connectionRefused())
      .mockResolvedValueOnce(new Response('sidecar-ok', { status: 200 }));

    const response = await probeSidecarEndpoint({
      url: 'http://alias:3000',
      fetchImpl,
      delayImpl,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(delayImpl).toHaveBeenCalledTimes(1);
    expect(delayImpl).toHaveBeenCalledWith(SIDECAR_PROBE_INTERVAL_MS);
  });

  it('throws after exhausting every bounded retry on persistent refusals', async () => {
    const maxAttempts = 3;
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(connectionRefused());
    const delayImpl = vi.fn(async () => undefined);

    await expect(
      probeSidecarEndpoint({ url: 'http://alias:3000', maxAttempts, fetchImpl, delayImpl })
    ).rejects.toThrow(TypeError);

    expect(fetchImpl).toHaveBeenCalledTimes(maxAttempts);
    expect(delayImpl).toHaveBeenCalledTimes(maxAttempts - 1);
  });

  it('treats any HTTP response as final without retrying', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('booting', { status: 503 }));
    const delayImpl = vi.fn(async () => undefined);

    const response = await probeSidecarEndpoint({ url: 'http://alias:3000', fetchImpl, delayImpl });

    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delayImpl).not.toHaveBeenCalled();
  });

  it('propagates non-transport errors immediately', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('abort'));
    const delayImpl = vi.fn(async () => undefined);

    await expect(
      probeSidecarEndpoint({ url: 'http://alias:3000', fetchImpl, delayImpl })
    ).rejects.toThrow('abort');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delayImpl).not.toHaveBeenCalled();
  });

  it('defaults to the documented ~20s budget', () => {
    expect(SIDECAR_PROBE_MAX_ATTEMPTS).toBe(20);
    expect(SIDECAR_PROBE_INTERVAL_MS).toBe(1_000);
  });
});

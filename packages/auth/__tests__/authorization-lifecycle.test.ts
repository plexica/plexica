import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTHORIZATION_REQUEST_TTL_MS,
  clearAuthorizationRequests,
  consumeAuthorizationRequest,
  storeAuthorizationRequest,
} from '../src/authorization-request.js';
import { AUTH_CALLBACK_REPLAY_TTL_MS, createAuthFlowCoordinator } from '../src/auth-flow.js';

import { MemoryStorage } from './test-helpers.js';

describe('authorization request lifecycle', () => {
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should remove abandoned PKCE records after their TTL', () => {
    storeAuthorizationRequest('abandoned', { codeVerifier: 'old', nonce: 'old-nonce' });
    now += AUTHORIZATION_REQUEST_TTL_MS + 1;
    storeAuthorizationRequest('current', { codeVerifier: 'new', nonce: 'new-nonce' });

    expect(() => consumeAuthorizationRequest('abandoned')).toThrow('missing or invalid');
    expect(consumeAuthorizationRequest('current')).toEqual({
      codeVerifier: 'new',
      nonce: 'new-nonce',
    });
  });

  it('should remove all auth records without clearing unrelated session data', () => {
    sessionStorage.setItem('unrelated', 'keep');
    storeAuthorizationRequest('first', { codeVerifier: 'one', nonce: 'nonce-one' });
    storeAuthorizationRequest('second', { codeVerifier: 'two', nonce: 'nonce-two' });

    clearAuthorizationRequests();

    expect(sessionStorage.getItem('unrelated')).toBe('keep');
    expect(() => consumeAuthorizationRequest('first')).toThrow('missing or invalid');
    expect(() => consumeAuthorizationRequest('second')).toThrow('missing or invalid');
  });
});

describe('callback replay lifecycle', () => {
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => vi.restoreAllMocks());

  it('should reject a settled callback until replay bookkeeping expires', async () => {
    const coordinator = createAuthFlowCoordinator();
    const operation = vi.fn().mockResolvedValue(undefined);
    await coordinator.runCallback('code', 'state', operation);

    await expect(coordinator.runCallback('code', 'state', operation)).rejects.toThrow(
      'already been handled'
    );
    now += AUTH_CALLBACK_REPLAY_TTL_MS + 1;
    await coordinator.runCallback('code', 'state', operation);

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should reset settled and in-flight replay bookkeeping', async () => {
    const coordinator = createAuthFlowCoordinator();
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const first = coordinator.runCallback('code', 'state', () => pending);
    coordinator.reset();
    finish?.();
    await first;

    const operation = vi.fn().mockResolvedValue(undefined);
    await coordinator.runCallback('code', 'state', operation);
    coordinator.reset();
    await coordinator.runCallback('code', 'state', operation);

    expect(operation).toHaveBeenCalledTimes(2);
  });
});

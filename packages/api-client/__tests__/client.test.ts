// File: packages/api-client/__tests__/client.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { HttpClient } from '../src/client.js';
import { ApiError } from '../src/types.js';
import type { AuthTokenProvider } from '../src/types.js';

describe('HttpClient', () => {
  let client: HttpClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'http://localhost:3000' });
    // Access the axios instance through the protected property via a cast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock = new MockAdapter((client as any).axios);
  });

  afterEach(() => {
    mock.restore();
  });

  // ---------------------------------------------------------------------------
  // Basic HTTP methods
  // ---------------------------------------------------------------------------

  describe('GET', () => {
    it('should make a GET request and return data', async () => {
      const payload = { id: '1', name: 'Test' };
      mock.onGet('/api/test').reply(200, payload);

      const result = await client.get('/api/test');
      expect(result).toEqual(payload);
    });

    it('should pass query params', async () => {
      mock.onGet('/api/test', { params: { page: 1, limit: 10 } }).reply(200, { ok: true });

      const result = await client.get('/api/test', { page: 1, limit: 10 });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('POST', () => {
    it('should make a POST request with body', async () => {
      mock.onPost('/api/test', { name: 'New' }).reply(201, { id: '2', name: 'New' });

      const result = await client.post('/api/test', { name: 'New' });
      expect(result).toEqual({ id: '2', name: 'New' });
    });

    it('should make a POST request without body', async () => {
      mock.onPost('/api/test').reply(200, { ok: true });

      const result = await client.post('/api/test');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('PATCH', () => {
    it('should make a PATCH request', async () => {
      mock.onPatch('/api/test/1', { name: 'Updated' }).reply(200, { id: '1', name: 'Updated' });

      const result = await client.patch('/api/test/1', { name: 'Updated' });
      expect(result).toEqual({ id: '1', name: 'Updated' });
    });
  });

  describe('PUT', () => {
    it('should make a PUT request', async () => {
      mock.onPut('/api/test/1', { name: 'Replaced' }).reply(200, { id: '1', name: 'Replaced' });

      const result = await client.put('/api/test/1', { name: 'Replaced' });
      expect(result).toEqual({ id: '1', name: 'Replaced' });
    });
  });

  describe('DELETE', () => {
    it('should make a DELETE request', async () => {
      mock.onDelete('/api/test/1').reply(200, { message: 'deleted' });

      const result = await client.delete('/api/test/1');
      expect(result).toEqual({ message: 'deleted' });
    });
  });

  // ---------------------------------------------------------------------------
  // Auth token injection
  // ---------------------------------------------------------------------------

  describe('Auth token injection', () => {
    it('should attach Bearer token when auth provider has a token', async () => {
      const provider: AuthTokenProvider = {
        getToken: () => 'test-jwt-token',
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBe('Bearer test-jwt-token');
        return [200, { ok: true }];
      });

      await client.get('/api/test');
    });

    it('should not attach token when provider returns null', async () => {
      const provider: AuthTokenProvider = {
        getToken: () => null,
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { ok: true }];
      });

      await client.get('/api/test');
    });

    it('should not attach token when no auth provider is set', async () => {
      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { ok: true }];
      });

      await client.get('/api/test');
    });

    it('should stop attaching token after clearAuthProvider', async () => {
      client.setAuthProvider({ getToken: () => 'token' });
      client.clearAuthProvider();

      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { ok: true }];
      });

      await client.get('/api/test');
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('Error handling', () => {
    it('should throw ApiError for 400 responses with structured body', async () => {
      mock.onGet('/api/test').reply(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Missing required field',
        details: { field: 'name' },
      });

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.message).toBe('Missing required field');
        expect(apiErr.errorCode).toBe('Bad Request');
        expect(apiErr.details).toEqual({ field: 'name' });
      }
    });

    it('should throw ApiError for 500 responses without structured body', async () => {
      mock.onGet('/api/test').reply(500, 'Internal Server Error');

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(500);
      }
    });

    it('should throw ApiError with status 0 for network errors', async () => {
      mock.onGet('/api/test').networkError();

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.isNetworkError).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 401 handling with token refresh
  // ---------------------------------------------------------------------------

  describe('401 with token refresh', () => {
    it('should retry request after successful token refresh', async () => {
      let callCount = 0;
      let currentToken = 'expired-token';

      const provider: AuthTokenProvider = {
        getToken: () => currentToken,
        refreshToken: async () => {
          currentToken = 'new-token';
          return true;
        },
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply((config) => {
        callCount++;
        if (config.headers?.Authorization === 'Bearer expired-token') {
          return [401, { statusCode: 401, error: 'Unauthorized', message: 'Token expired' }];
        }
        return [200, { ok: true }];
      });

      const result = await client.get('/api/test');
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(2); // First call (401) + retry (200)
    });

    it('should call onAuthFailure when refresh fails', async () => {
      const onAuthFailure = vi.fn();

      const provider: AuthTokenProvider = {
        getToken: () => 'bad-token',
        refreshToken: async () => false,
        onAuthFailure,
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token expired',
      });

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).isUnauthorized).toBe(true);
      }

      expect(onAuthFailure).toHaveBeenCalledOnce();
    });

    it('should call onAuthFailure when refreshToken throws', async () => {
      const onAuthFailure = vi.fn();

      const provider: AuthTokenProvider = {
        getToken: () => 'bad-token',
        refreshToken: async () => {
          throw new Error('Refresh failed');
        },
        onAuthFailure,
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token expired',
      });

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
      }

      expect(onAuthFailure).toHaveBeenCalledOnce();
    });

    it('should not attempt refresh if provider has no refreshToken', async () => {
      const provider: AuthTokenProvider = {
        getToken: () => 'bad-token',
      };
      client.setAuthProvider(provider);

      mock.onGet('/api/test').reply(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Bad token',
      });

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).isUnauthorized).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('Configuration', () => {
    it('should set Content-Type to application/json by default', async () => {
      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.['Content-Type']).toBe('application/json');
        return [200, {}];
      });

      await client.get('/api/test');
    });

    it('should merge additional headers from config', async () => {
      const customClient = new HttpClient({
        baseUrl: 'http://localhost:3000',
        headers: { 'X-Custom': 'value' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customMock = new MockAdapter((customClient as any).axios);

      customMock.onGet('/api/test').reply((config) => {
        expect(config.headers?.['X-Custom']).toBe('value');
        return [200, {}];
      });

      await customClient.get('/api/test');
      customMock.restore();
    });
  });
});

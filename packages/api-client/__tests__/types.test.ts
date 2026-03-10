// File: packages/api-client/__tests__/types.test.ts

import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/types.js';

describe('ApiError', () => {
  it('should create an error with all fields', () => {
    const error = new ApiError({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: { field: 'email', reason: 'invalid format' },
    });

    expect(error.message).toBe('Validation failed');
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('Bad Request');
    expect(error.details).toEqual({ field: 'email', reason: 'invalid format' });
    expect(error.name).toBe('ApiError');
    expect(error.isApiError).toBe(true);
  });

  it('should create an error without details', () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something broke',
    });

    expect(error.details).toBeUndefined();
    expect(error.statusCode).toBe(500);
  });

  describe('convenience getters', () => {
    it('isNetworkError should be true when statusCode is 0', () => {
      const error = new ApiError({ statusCode: 0, error: 'NETWORK', message: 'no response' });
      expect(error.isNetworkError).toBe(true);
      expect(error.isUnauthorized).toBe(false);
    });

    it('isUnauthorized should be true for 401', () => {
      const error = new ApiError({ statusCode: 401, error: 'Unauthorized', message: 'bad token' });
      expect(error.isUnauthorized).toBe(true);
      expect(error.isForbidden).toBe(false);
    });

    it('isForbidden should be true for 403', () => {
      const error = new ApiError({ statusCode: 403, error: 'Forbidden', message: 'no access' });
      expect(error.isForbidden).toBe(true);
    });

    it('isNotFound should be true for 404', () => {
      const error = new ApiError({ statusCode: 404, error: 'Not Found', message: 'missing' });
      expect(error.isNotFound).toBe(true);
    });

    it('isValidationError should be true for 422', () => {
      const error = new ApiError({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'invalid',
      });
      expect(error.isValidationError).toBe(true);
    });

    it('isRateLimited should be true for 429', () => {
      const error = new ApiError({
        statusCode: 429,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
      });
      expect(error.isRateLimited).toBe(true);
    });

    it('isRateLimited should be false for 400', () => {
      const error = new ApiError({
        statusCode: 400,
        error: 'Bad Request',
        message: 'bad request',
      });
      expect(error.isRateLimited).toBe(false);
    });
  });

  describe('retryAfter field', () => {
    it('should be null by default when not provided', () => {
      const error = new ApiError({ statusCode: 400, error: 'Bad Request', message: 'bad' });
      expect(error.retryAfter).toBeNull();
    });

    it('should be null when explicitly set to null', () => {
      const error = new ApiError({
        statusCode: 429,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'rate limited',
        retryAfter: null,
      });
      expect(error.retryAfter).toBeNull();
    });

    it('should be set when a retryAfter value is provided', () => {
      const error = new ApiError({
        statusCode: 429,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'rate limited',
        retryAfter: 30,
      });
      expect(error.retryAfter).toBe(30);
    });

    it('should be set to 0 when retryAfter is 0', () => {
      const error = new ApiError({
        statusCode: 429,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'rate limited',
        retryAfter: 0,
      });
      expect(error.retryAfter).toBe(0);
    });
  });

  it('should be instanceof Error', () => {
    const error = new ApiError({ statusCode: 400, error: 'Bad', message: 'bad' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });
});

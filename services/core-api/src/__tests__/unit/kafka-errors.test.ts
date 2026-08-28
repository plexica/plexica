// unit/kafka-errors.test.ts
// Unit tests for Prisma retriability classification — allowlist, never by message.

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { isRetriablePrismaError } from '../../lib/kafka-errors.js';

const CLIENT_VERSION = '6.19.3';

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`prisma error ${code}`, {
    code,
    clientVersion: CLIENT_VERSION,
  });
}

describe('isRetriablePrismaError', () => {
  it('classifies transient known Prisma codes as retriable', () => {
    const transient = ['P1001', 'P1002', 'P1008', 'P1011', 'P1017', 'P2024', 'P2028', 'P2034'];
    for (const code of transient) {
      expect(isRetriablePrismaError(knownError(code)), code).toBe(true);
    }
  });

  it('classifies PrismaClientInitializationError as retriable', () => {
    const error = new Prisma.PrismaClientInitializationError('init failed', CLIENT_VERSION);
    expect(isRetriablePrismaError(error)).toBe(true);
  });

  it('classifies permanent known Prisma codes as non-retriable', () => {
    for (const code of ['P2002', 'P2025']) {
      expect(isRetriablePrismaError(knownError(code)), code).toBe(false);
    }
  });

  it('never classifies a Prisma error by its message text', () => {
    const error = knownError('P2002');
    (error as unknown as { message: string }).message = 'connection timed out P1001';
    expect(isRetriablePrismaError(error)).toBe(false);
  });

  it('never classifies PrismaClientUnknownRequestError by message text', () => {
    const error = new Prisma.PrismaClientUnknownRequestError('connection timed out P1001', {
      clientVersion: CLIENT_VERSION,
    });
    expect(isRetriablePrismaError(error)).toBe(false);
  });

  it('falls back to the message regex only for non-Prisma errors', () => {
    expect(isRetriablePrismaError(new Error('connect ECONNREFUSED 127.0.0.1:9092'))).toBe(true);
    expect(isRetriablePrismaError(new Error('Timed out awaiting connection'))).toBe(true);
    expect(isRetriablePrismaError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetriablePrismaError(new Error('unrelated failure'))).toBe(false);
  });

  it('returns false for plain non-matching errors', () => {
    expect(isRetriablePrismaError(new Error('boom'))).toBe(false);
  });
});

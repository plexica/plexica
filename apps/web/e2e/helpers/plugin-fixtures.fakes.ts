// plugin-fixtures.fakes.ts
// Shared fake Playwright page/request plumbing for the fixture-helper
// regression guards. Every POST that declares
// `Content-Type: application/json` MUST carry a JSON body, otherwise Fastify
// rejects it with 400 "Body cannot be empty when content-type is set to
// 'application/json'" (live run 32754231611).

import { expect } from 'vitest';

import type { Page } from '@playwright/test';

export interface RecordedRequestOptions {
  headers?: Record<string, string>;
  data?: unknown;
  timeout?: unknown;
}

export interface RecordedRequest {
  method: string;
  url: string;
  options?: RecordedRequestOptions | undefined;
}

export interface FakeResponseOptions {
  status: number;
  body?: unknown;
}

export function fakeResponse({ status, body }: FakeResponseOptions) {
  return {
    status: () => status,
    statusText: () => '',
    ok: () => status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
    json: () => Promise.resolve(body ?? {}),
  };
}

export function fakePage(handler: (req: RecordedRequest) => FakeResponseOptions): {
  page: Page;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const record = (
    method: string,
    url: string,
    options?: Record<string, unknown>
  ): RecordedRequest => {
    const req: RecordedRequest = {
      method,
      url,
      options: options as RecordedRequestOptions | undefined,
    };
    requests.push(req);
    return req;
  };
  const page = {
    request: {
      post: async (url: string, options?: Record<string, unknown>) =>
        fakeResponse(handler(record('POST', url, options))),
      patch: async (url: string, options?: Record<string, unknown>) =>
        fakeResponse(handler(record('PATCH', url, options))),
      delete: async (url: string, options?: Record<string, unknown>) =>
        fakeResponse(handler(record('DELETE', url, options))),
      get: async (url: string, options?: Record<string, unknown>) =>
        fakeResponse(handler(record('GET', url, options))),
    },
    // getBrowserToken(page) reads the refreshed access token from the browser
    // session (H-04: 60s TTL, silent refresh in sessionStorage). The fake
    // returns the stored session string exactly as the real sessionStorage
    // read would, so the fixture yields a plain token (CodeRabbit).
    evaluate: async (): Promise<string> =>
      JSON.stringify({ state: { accessToken: 'unit-test-token' } }),
  };
  return { page: page as unknown as Page, requests };
}

export function assertJsonPostsCarryBody(requests: RecordedRequest[]): void {
  const posts = requests.filter((req) => req.method === 'POST');
  expect(posts.length).toBeGreaterThan(0);
  for (const post of posts) {
    const contentType = post.options?.headers?.['Content-Type'];
    if (contentType !== 'application/json') continue;
    expect(
      post.options?.data,
      `POST ${post.url} sets Content-Type application/json but has no body`
    ).toBeDefined();
    const body = post.options?.data;
    if (typeof body === 'string') expect(() => JSON.parse(body)).not.toThrow();
  }
}

/**
 * Regression guard for live run 32934334508: every recorded request must carry
 * the explicit API timeout — Playwright's implicit window is too tight for
 * server-side install flows under CI load.
 */
export function assertRequestsCarryApiTimeout(requests: RecordedRequest[], expected: unknown): void {
  expect(requests.length).toBeGreaterThan(0);
  for (const req of requests) {
    expect(req.options?.timeout, `request ${req.method} ${req.url} misses the API timeout`).toBe(
      expected
    );
  }
}

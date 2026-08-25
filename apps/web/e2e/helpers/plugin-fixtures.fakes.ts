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
      delete: async (url: string) => fakeResponse(handler(record('DELETE', url))),
      get: async (url: string) => fakeResponse(handler(record('GET', url))),
    },
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

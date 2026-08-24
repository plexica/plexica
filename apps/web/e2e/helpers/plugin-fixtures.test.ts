// plugin-fixtures.test.ts
// Behavioral regression guard for the E2E fixture helpers: every POST that
// declares `Content-Type: application/json` MUST carry a JSON body, otherwise
// Fastify rejects it with 400 "Body cannot be empty when content-type is set
// to 'application/json'" (live run 32754231611).

import { describe, expect, it } from 'vitest';

import { createWorkspaceFixture, ensureCrmInstalled } from './plugin-fixtures.js';

import type { Page } from '@playwright/test';

interface RecordedRequestOptions {
  headers?: Record<string, string>;
  data?: unknown;
}

interface RecordedRequest {
  method: string;
  url: string;
  options?: RecordedRequestOptions | undefined;
}

interface FakeResponseOptions {
  status: number;
  body?: unknown;
}

function fakeResponse({ status, body }: FakeResponseOptions) {
  return {
    status: () => status,
    statusText: () => '',
    ok: () => status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
    json: () => Promise.resolve(body ?? {}),
  };
}

function fakePage(handler: (req: RecordedRequest) => FakeResponseOptions): {
  page: Page;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const page = {
    request: {
      post: async (url: string, options?: Record<string, unknown>) => {
        const req: RecordedRequest = {
          method: 'POST',
          url,
          options: options as RecordedRequestOptions | undefined,
        };
        requests.push(req);
        return fakeResponse(handler(req));
      },
      patch: async (url: string, options?: Record<string, unknown>) => {
        const req: RecordedRequest = {
          method: 'PATCH',
          url,
          options: options as RecordedRequestOptions | undefined,
        };
        requests.push(req);
        return fakeResponse(handler(req));
      },
      get: async (url: string) => {
        const req = { method: 'GET', url };
        requests.push(req);
        return fakeResponse(handler(req));
      },
    },
  };
  return { page: page as unknown as Page, requests };
}

function assertJsonPostsCarryBody(requests: RecordedRequest[]): void {
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

describe('plugin e2e fixtures', () => {
  it('ensureCrmInstalled sends an explicit empty JSON body on install', async () => {
    let installationsRequested = false;
    const { page, requests } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        return {
          status: 200,
          body: installationsRequested ? [{ id: 'install-1', pluginSlug: 'crm', status: 'active' }] : [],
        };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        installationsRequested = true;
        return { status: 200, body: { status: 'active', installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const installId = await ensureCrmInstalled(page, 'token-123');

    expect(installId).toBe('install-1');
    const install = requests.find((req) => req.url.endsWith('/api/v1/plugins/crm/install'));
    expect(install?.options?.headers?.['Content-Type']).toBe('application/json');
    // Regression guard for run 32754231611: the install POST must carry a
    // serializable (possibly empty) JSON body, never a header-only payload.
    expect(install?.options?.data).toEqual({});
    assertJsonPostsCarryBody(requests);
  });

  it('createWorkspaceFixture posts its payload with a JSON body', async () => {
    const { page, requests } = fakePage((req) => {
      if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
        return { status: 201, body: { id: 'ws-1' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const workspaceId = await createWorkspaceFixture(page, 'token-123', 'e2e-ws');

    expect(workspaceId).toBe('ws-1');
    assertJsonPostsCarryBody(requests);
  });
});

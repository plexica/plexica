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
  it('ensureCrmInstalled sends an explicit empty JSON body on install and activates on first poll', async () => {
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

    const installId = await ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 5000 });

    expect(installId).toBe('install-1');
    const install = requests.find((req) => req.url.endsWith('/api/v1/plugins/crm/install'));
    expect(install?.options?.headers?.['Content-Type']).toBe('application/json');
    // Regression guard for run 32754231611: the install POST must carry a
    // serializable (possibly empty) JSON body, never a header-only payload.
    expect(install?.options?.data).toEqual({});
    assertJsonPostsCarryBody(requests);
  });

  it('ensureCrmInstalled polls until the installation reads active on a later poll', async () => {
    let installedReads = 0;
    const { page, requests } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        installedReads += 1;
        if (installedReads === 2) {
          return {
            status: 200,
            body: [{ id: 'install-1', pluginSlug: 'crm', status: 'active' }],
          };
        }
        return { status: 200, body: [] };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { status: 'installing', installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const installId = await ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 5000 });

    expect(installId).toBe('install-1');
    expect(installedReads).toBeGreaterThanOrEqual(2);
    assertJsonPostsCarryBody(requests);
  });

  it('ensureCrmInstalled reports observed status and install-response fields on poll exhaustion', async () => {
    let installedReads = 0;
    const { page } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        installedReads += 1;
        if (installedReads === 1) return { status: 200, body: [] };
        return {
          status: 200,
          body: [{ id: 'install-1', pluginSlug: 'crm', status: 'degraded' }],
        };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { status: 'degraded', degraded: true, installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    await expect(
      ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(
      /was not activated within 30ms; last observed crm installation status: 'degraded'; install response reported: status='degraded', degraded=true/
    );
    expect(installedReads).toBeGreaterThanOrEqual(2);
  });

  it('ensureCrmInstalled reports missing installation when no crm row ever appears', async () => {
    const { page } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        return { status: 200, body: [] };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    await expect(
      ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(/last observed crm installation status: 'missing'; install response reported: <no status\/degraded fields>/);
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

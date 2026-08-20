// api-response.ts
// Single, shared convention for asserting HTTP status codes in E2E tests.
//
// WHY THIS EXISTS (Constitution Rule 3 — one pattern per kind of operation):
// the suite mixed four incompatible conventions for the same assertion:
//   expect(resp.status()).toBe(200)
//   if (resp.status() >= 400) throw new Error(...)
//   expect(resp.status()).toBeGreaterThanOrEqual(200) + .toBeLessThan(300)
//   response.url().includes('/api/v1/…') as the matching predicate
//
// Why they are worse than one shared helper:
//   * `throw new Error(...)` bypasses Playwright's reporting — no trace
//     annotation, no formatted diff. In CI it renders as a raw stack trace
//     instead of a readable expectation failure.
//   * `>= 400` / `< 300` are too weak: they accept 204, 301 and 304. An endpoint
//     regressing to "204 No Content" would break the TanStack Query refetch the
//     UI assertions depend on, yet still pass.
//   * `url().includes('/api/v1/workspaces')` also matches
//     `/api/v1/workspaces/:id/members` and a reintroduced duplicated prefix such
//     as `/api/api/v1/profile`. `responseTo()` compares the pathname EXACTLY.
//
// Two entry points cover every shape used by the suite:
//   * expectResponseTo() — a response the BROWSER produces as a consequence of a
//     UI action (click, setInputFiles). Arms the listener before the action.
//   * expectApiStatus()  — a response from a direct APIRequestContext call
//     (page.request.*), where there is nothing to wait for.
//
// Both take the expected status explicitly (default 200) so 201 (POST
// /workspaces), 204 (DELETE) and 403 (authorization assertions) can use the same
// convention instead of falling back to a hand-rolled comparison.
//
// SCOPE: these helpers assert HTTP round-trips. Direct `fetch()` calls to
// non-application services (Mailpit, Keycloak admin REST) are outside it.

import { expect } from '@playwright/test';

import type { APIResponse, Page, Response } from '@playwright/test';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Builds a `waitForResponse` predicate matching an EXACT pathname + method.
 * Non-parsable URLs (e.g. `data:` responses) are rejected rather than throwing
 * inside the predicate, which would abort the wait with an opaque error.
 */
export function responseTo(pathname: string, method: HttpMethod) {
  return (response: Response): boolean => {
    let actualPathname: string;
    try {
      actualPathname = new URL(response.url()).pathname;
    } catch {
      return false;
    }
    return actualPathname === pathname && response.request().method() === method;
  };
}

/**
 * Arms the response listener BEFORE running `action`, waits for both, and
 * asserts the response status.
 *
 * BOTH promises get a no-op `.catch()` attached before the first `await`. A
 * one-sided guard is not enough: `Promise.all` rejects as soon as either side
 * rejects, leaving the OTHER promise pending and unhandled. Concretely, when
 * `waitForResponse` times out first (30 s) while the click is still pending, the
 * click's later timeout rejection surfaced as an unhandled rejection at
 * teardown — the exact failure mode this helper claims to prevent.
 * `Promise.all` is kept (instead of `allSettled`) so the first real failure is
 * reported immediately rather than after the slower promise also settles.
 *
 * Returns the Response so callers can additionally assert the body.
 */
export async function expectResponseTo(
  page: Page,
  pathname: string,
  method: HttpMethod,
  action: () => Promise<void>,
  expectedStatus = 200
): Promise<Response> {
  const responsePromise = page.waitForResponse(responseTo(pathname, method));
  const actionPromise = action();
  responsePromise.catch(() => undefined);
  actionPromise.catch(() => undefined);

  const [response] = await Promise.all([responsePromise, actionPromise]);
  expect(response.status(), `${method} ${pathname} must return ${String(expectedStatus)}`).toBe(
    expectedStatus
  );
  return response;
}

/**
 * Asserts the status of a direct APIRequestContext response (page.request.*).
 *
 * On mismatch the body is included in the failure message: a bare
 * "expected 201, got 400" hides the `{ error: { code } }` envelope that says
 * why, which is precisely what the previous `throw new Error(...)` call sites
 * were hand-rolling.
 */
export async function expectApiStatus(
  response: APIResponse,
  expectedStatus = 200
): Promise<APIResponse> {
  if (response.status() === expectedStatus) return response;

  const body = await response.text().catch(() => '<unreadable body>');
  const pathname = ((): string => {
    try {
      return new URL(response.url()).pathname;
    } catch {
      return response.url();
    }
  })();
  expect(
    response.status(),
    `${pathname} must return ${String(expectedStatus)} — body: ${body}`
  ).toBe(expectedStatus);
  return response;
}

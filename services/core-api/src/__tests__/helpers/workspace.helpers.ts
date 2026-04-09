// workspace.helpers.ts
// HTTP-level helpers for workspace integration tests (Spec 003, Phase 18).
// Extracted to keep test files under the 200-line constitution limit (Rule 4).

import type { FastifyInstance } from 'fastify';
import type { WorkspaceDetailDto } from '../../modules/workspace/types.js';

type InjectHeaders = Record<string, string>;

/**
 * POSTs to /api/v1/workspaces and returns the parsed response body.
 * Caller decides how to handle non-201 status codes.
 */
export async function createWorkspaceViaApi(
  server: FastifyInstance,
  headers: InjectHeaders,
  payload: {
    name: string;
    description?: string | null;
    parentId?: string | null;
    templateId?: string | null;
  }
): Promise<{ statusCode: number; body: unknown }> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/workspaces',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as unknown };
}

/**
 * GETs /api/v1/workspaces/:id and returns parsed response.
 */
export async function getWorkspaceViaApi(
  server: FastifyInstance,
  headers: InjectHeaders,
  workspaceId: string
): Promise<{ statusCode: number; body: unknown }> {
  const res = await server.inject({
    method: 'GET',
    url: `/api/v1/workspaces/${workspaceId}`,
    headers,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as unknown };
}

/**
 * Convenience: create workspace and assert 201, returning the DTO.
 */
export async function mustCreateWorkspace(
  server: FastifyInstance,
  headers: InjectHeaders,
  name: string,
  extra: { parentId?: string | null; templateId?: string | null } = {}
): Promise<WorkspaceDetailDto> {
  const { statusCode, body } = await createWorkspaceViaApi(server, headers, {
    name,
    ...extra,
  });
  if (statusCode !== 201) {
    throw new Error(
      `Expected 201 creating workspace "${name}", got ${statusCode}: ${JSON.stringify(body)}`
    );
  }
  return body as WorkspaceDetailDto;
}

/**
 * Deletes (archives) a workspace and returns status code.
 */
export async function deleteWorkspaceViaApi(
  server: FastifyInstance,
  headers: InjectHeaders,
  workspaceId: string
): Promise<number> {
  const res = await server.inject({
    method: 'DELETE',
    url: `/api/v1/workspaces/${workspaceId}`,
    headers,
  });
  return res.statusCode;
}

/**
 * Restores an archived workspace.
 */
export async function restoreWorkspaceViaApi(
  server: FastifyInstance,
  headers: InjectHeaders,
  workspaceId: string
): Promise<{ statusCode: number; body: unknown }> {
  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/restore`,
    headers,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as unknown };
}

/**
 * Reparents a workspace to a new parent (or to root when newParentId is null).
 */
export async function reparentWorkspaceViaApi(
  server: FastifyInstance,
  headers: InjectHeaders,
  workspaceId: string,
  newParentId: string | null
): Promise<{ statusCode: number; body: unknown }> {
  const res = await server.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/reparent`,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ newParentId }),
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as unknown };
}

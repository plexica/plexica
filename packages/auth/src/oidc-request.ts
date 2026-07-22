import type { TokenResponse } from './types.js';

export const AUTH_REQUEST_TIMEOUT_MS = 10_000;

export const AUTH_ERROR_MESSAGES = {
  exchange: 'Authentication could not be completed.',
  refresh: 'Session refresh failed.',
  revoke: 'Sign out could not be completed.',
} as const;

export class AuthRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTokenResponse(value: unknown, errorMessage: string): TokenResponse {
  if (
    !isRecord(value) ||
    typeof value['access_token'] !== 'string' ||
    typeof value['refresh_token'] !== 'string' ||
    typeof value['expires_in'] !== 'number' ||
    typeof value['refresh_expires_in'] !== 'number' ||
    value['token_type'] !== 'Bearer' ||
    (value['id_token'] !== undefined && typeof value['id_token'] !== 'string')
  ) {
    throw new AuthRequestError(errorMessage);
  }

  const tokens: TokenResponse = {
    access_token: value['access_token'],
    refresh_token: value['refresh_token'],
    expires_in: value['expires_in'],
    refresh_expires_in: value['refresh_expires_in'],
    token_type: value['token_type'],
  };
  if (typeof value['id_token'] === 'string') tokens.id_token = value['id_token'];
  return tokens;
}

async function postForm(
  url: string,
  body: URLSearchParams,
  errorMessage: string,
  timeoutMs?: number
): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new AuthRequestError(errorMessage);
    return response;
  } catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(errorMessage);
  }
}

export async function requestTokens(
  url: string,
  body: URLSearchParams,
  errorMessage: string,
  timeoutMs?: number
): Promise<TokenResponse> {
  const response = await postForm(url, body, errorMessage, timeoutMs);
  try {
    return parseTokenResponse(await response.json(), errorMessage);
  } catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(errorMessage);
  }
}

export async function revokeTokens(
  url: string,
  body: URLSearchParams,
  timeoutMs?: number
): Promise<void> {
  await postForm(url, body, AUTH_ERROR_MESSAGES.revoke, timeoutMs);
}

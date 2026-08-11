// api-error.ts
// Error shape and response parsing for the shared API client.
// Split out of api-client.ts to keep both files under the 200-line limit
// (Constitution Rule 4). Everything here is re-exported by api-client.ts, which
// remains the import surface consumers use.

/** Sentinel status for failures that did not come from an HTTP status code. */
export const NON_HTTP_STATUS = 0;

export interface ErrorBody {
  code?: string;
  message?: string;
  conflictType?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly conflictType: string | undefined;

  constructor(status: number, body: ErrorBody) {
    super(body.message ?? `Request failed: ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.conflictType = body.conflictType;
  }
}

/**
 * The response reached us but does not match the agreed contract.
 *
 * Uses `NON_HTTP_STATUS` (0), never the transport status: a malformed body served
 * with `200` is not a success, and any handler branching on `status` (401 →
 * re-login, 5xx → retry) would classify a real status wrongly.
 */
export function invalidResponseError(
  message = 'The server returned an unexpected response'
): ApiError {
  return new ApiError(NON_HTTP_STATUS, { code: 'INVALID_RESPONSE', message });
}

/** Extracts `{ code, message, conflictType }` from the `{ error: … }` envelope. */
export async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null || !('error' in value)) return {};
    const error = value.error;
    if (typeof error !== 'object' || error === null) return {};
    const fields = error as Record<string, unknown>;
    return {
      ...(typeof fields['code'] === 'string' ? { code: fields['code'] } : {}),
      ...(typeof fields['message'] === 'string' ? { message: fields['message'] } : {}),
      ...(typeof fields['conflictType'] === 'string'
        ? { conflictType: fields['conflictType'] }
        : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Basic runtime validation: a successful response must carry a JSON object or
 * array. Callers may further validate with Zod as needed.
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const value: unknown = await response.json().catch(() => null);
  if (typeof value !== 'object' || value === null) {
    throw invalidResponseError('Expected a JSON object or array response');
  }
  return value as T;
}

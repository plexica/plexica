import { randomUUID } from 'node:crypto';

const LOKI_URL = process.env['PLAYWRIGHT_LOKI_URL'] ?? 'http://localhost:3100';
const ALLOW_MISSING_LOKI =
  process.env['CI'] === undefined &&
  process.env['PLAYWRIGHT_ALLOW_MISSING_LOKI'] === 'true';

async function isLokiReady(): Promise<boolean> {
  try {
    const response = await fetch(`${LOKI_URL}/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function seedLokiLog(tenant: string): Promise<string | null> {
  if (!(await isLokiReady())) {
    if (ALLOW_MISSING_LOKI) return null;
    throw new Error(
      `Loki is required at ${LOKI_URL}. Only local runs may opt out with ` +
        'PLAYWRIGHT_ALLOW_MISSING_LOKI=true.'
    );
  }

  const fixtureId = randomUUID();
  const message = `Admin logs E2E fixture ${fixtureId}`;
  const timestampNs = (BigInt(Date.now()) * 1_000_000n).toString();
  const response = await fetch(`${LOKI_URL}/loki/api/v1/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      streams: [
        {
          stream: { app: 'plexica-core', tenant, fixture: fixtureId },
          values: [[timestampNs, JSON.stringify({ level: 'info', tenant, msg: message })]],
        },
      ],
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(
      `Loki fixture push failed: HTTP ${response.status} ${await response.text()}`
    );
  }
  return message;
}

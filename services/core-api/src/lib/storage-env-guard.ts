// storage-env-guard.ts
// Dual fail-fast guard for stale object-storage environment variables
// (FR-004). Rejects both the legacy MINIO_* host vars and the superseded
// SILO_* proposal, naming the neutral STORAGE_* replacement for each key.
// MINIO_ROOT_USER / MINIO_ROOT_PASSWORD are deliberately excluded: they exist
// only as Compose mapping targets fed from ${STORAGE_*} (allowlist E3).

const STALE_STORAGE_KEYS: Readonly<Record<string, string>> = {
  MINIO_ENDPOINT: 'STORAGE_ENDPOINT',
  MINIO_PUBLIC_ENDPOINT: 'STORAGE_PUBLIC_ENDPOINT',
  MINIO_ACCESS_KEY: 'STORAGE_ACCESS_KEY',
  MINIO_SECRET_KEY: 'STORAGE_SECRET_KEY',
  MINIO_PORT: 'STORAGE_PORT',
  MINIO_CONSOLE_PORT: 'STORAGE_CONSOLE_PORT',
  MINIO_HOST_URL: 'STORAGE_HOST_URL',
  SILO_ENDPOINT: 'STORAGE_ENDPOINT',
  SILO_PUBLIC_ENDPOINT: 'STORAGE_PUBLIC_ENDPOINT',
  SILO_ACCESS_KEY: 'STORAGE_ACCESS_KEY',
  SILO_SECRET_KEY: 'STORAGE_SECRET_KEY',
  SILO_PORT: 'STORAGE_PORT',
  SILO_CONSOLE_PORT: 'STORAGE_CONSOLE_PORT',
  SILO_HOST_URL: 'STORAGE_HOST_URL',
};

export function assertNoStaleStorageEnv(environment: NodeJS.ProcessEnv): void {
  const staleEntries = Object.entries(STALE_STORAGE_KEYS).filter(
    ([staleKey]) => environment[staleKey] !== undefined
  );
  if (staleEntries.length === 0) {
    return;
  }
  const listed = staleEntries
    .map(([staleKey, replacement]) => `${staleKey} -> ${replacement}`)
    .join(', ');
  throw new Error(
    `Stale environment variable(s) detected: ${listed}. Rename them to their ` +
      'STORAGE_* replacements to configure object storage; the stale keys are no longer read.'
  );
}

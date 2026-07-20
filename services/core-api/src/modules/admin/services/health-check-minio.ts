// health-check-minio.ts
// MinIO health probe — calls the shared client's lightweight bucket-list
// operation to verify object storage connectivity.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { pingMinio } from '../../../lib/minio-client.js';

import { buildServiceResult, withProbeTimeout } from './health-checker.service.js';

import type { HealthServiceResult } from '../schemas/health-schemas.js';

export async function probeMinio(): Promise<HealthServiceResult> {
  const name = 'minio';
  const start = performance.now();

  try {
    await withProbeTimeout(pingMinio());
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}

// health-check-minio.ts
// MinIO health probe — calls the shared client's lightweight bucket-list
// operation to verify object storage connectivity.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { pingMinio } from '../../../lib/minio-client.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

export const probeMinio = makeProbe('minio', () => withProbeTimeout(pingMinio()));

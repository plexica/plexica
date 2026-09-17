// health-check-storage.ts
// Object-storage health probe — calls the shared client's lightweight
// bucket-list operation to verify object storage connectivity.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { pingStorage } from '../../../lib/storage-client.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

export const probeStorage = makeProbe('storage', () => withProbeTimeout(pingStorage()));
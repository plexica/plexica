import { z } from 'zod';

/**
 * Environment variables of the CI runtime contract (see
 * ./ci-runtime-contract.js for the cross-field validation rules).
 * Extracted from config.ts to keep that module focused on core settings;
 * spread into the main schema so parsing semantics stay identical.
 */
export const ciRuntimeEnvSchema = z.object({
  CI_RUNTIME_CONTRACT: z.literal('1').optional(),
  CI_RUNTIME_CONTRACT_CONTAINER: z.literal('1').optional(),
  CI_RUNTIME_PROJECT: z.string().optional(),
  // Exact path of the project E2E Postgres CA inside this container. The
  // cross-field container contract (ci-runtime-contract.ts) enforces the
  // value; the manager derives sidecar CA binds from it.
  CI_RUNTIME_CA_FILE: z.literal('/run/plexica-ci/postgres-ca.crt').optional(),
  PLUGIN_DOCKER_HOST: z.string().optional(),
  PLUGIN_SIDECAR_IMAGE: z.string().min(1).optional(),
  CI_SIDECAR_HARNESS_IMAGE: z.string().min(1).optional(),
});

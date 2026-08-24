import { z } from 'zod';

/**
 * Environment variables of the CI runtime contract (see
 * ./ci-runtime-contract.js for the cross-field validation rules).
 * Extracted from config.ts to keep that module focused on core settings;
 * spread into the main schema so parsing semantics stay identical.
 */
export const ciRuntimeEnvSchema = z.object({
  CI_RUNTIME_CONTRACT: z.literal('1').optional(),
  CI_RUNTIME_PROJECT: z.string().optional(),
  PLUGIN_DOCKER_HOST: z.string().optional(),
  PLUGIN_SIDECAR_IMAGE: z.string().min(1).optional(),
  CI_SIDECAR_HARNESS_IMAGE: z.string().min(1).optional(),
});

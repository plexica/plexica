import { config } from '../../../lib/config.js';

import { isCiPluginRuntime } from './plugin-container-identity.js';

const DIGEST_PINNED =
  /^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/)?[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$/;

export function isDigestPinnedImage(reference: string): boolean {
  return DIGEST_PINNED.test(reference);
}

/**
 * Resolves the sidecar image for Docker lifecycle operations.
 *
 * Under the CI runtime contract the Docker control proxy admits exactly two
 * trusted digest-pinned images from the environment, so both variables must be
 * present and digest-pinned or resolution fails closed loudly. Harness-marked
 * installs (manifest image identical to CI_SIDECAR_HARNESS_IMAGE) resolve to
 * CI_SIDECAR_HARNESS_IMAGE; every other install resolves to
 * PLUGIN_SIDECAR_IMAGE. Manifest-derived references are otherwise ignored.
 * Outside CI the manifest image is used unchanged.
 */
export function resolveSidecarImage(manifestImage: string): string {
  if (!isCiPluginRuntime()) return manifestImage;
  for (const variable of ['PLUGIN_SIDECAR_IMAGE', 'CI_SIDECAR_HARNESS_IMAGE'] as const) {
    const pinned = config[variable];
    if (!pinned || !isDigestPinnedImage(pinned)) {
      throw new Error(`CI plugin runtime requires a digest-pinned ${variable}`);
    }
  }
  return manifestImage === config.CI_SIDECAR_HARNESS_IMAGE
    ? (config.CI_SIDECAR_HARNESS_IMAGE as string)
    : (config.PLUGIN_SIDECAR_IMAGE as string);
}

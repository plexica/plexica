// docker-container-errors.ts — Dockerode error classification shared by the
// container manager's cleanup paths. Cleanup only requires the container to
// end up gone, so transient/already-gone daemon answers are treated as
// success and everything else propagates.

import Docker from 'dockerode';

import { config } from '../../../lib/config.js';

// Dockerode 304 = "already stopped", 404 = "no such container": both are
// success for cleanup paths, which only require the container to end up gone.
export function ignoreStopError(error: unknown): void {
  const status = (error as { statusCode?: number }).statusCode;
  if (status === 304 || status === 404) return;
  if (!/(already stopped|is not running|not found|No such)/.test((error as Error).message))
    throw error;
}

export function isMissingContainer(error: unknown): boolean {
  const message = (error as Error).message;
  return (
    (error as { statusCode?: number }).statusCode === 404 ||
    /not found|No such/.test(message) ||
    // The CI docker proxy collapses every non-200 inspect into this message;
    // for stop/remove it can only mean the container is already gone.
    /Unknown plugin container/.test(message)
  );
}

export function dockerClient(): Docker {
  if (!config.PLUGIN_DOCKER_HOST) return new Docker();
  const endpoint = new URL(config.PLUGIN_DOCKER_HOST);
  return new Docker({
    protocol: endpoint.protocol === 'https:' ? 'https' : 'http',
    host: endpoint.hostname,
    port: Number(endpoint.port),
  });
}

/**
 * DockerContainerAdapter (ADR-019, T004-07)
 *
 * Implements ContainerAdapter using the `dockerode` library.
 * Handles image pulling, container lifecycle, resource limits, and network
 * isolation using a dedicated `plexica-plugins` Docker network.
 *
 * Constitution Compliance:
 * - Article 1.2 §4: Plugin isolation (dedicated network, no host-network access)
 * - Article 4.3: P95 API < 200ms — health polling is done in the caller
 * - Article 6.3: Structured Pino logging
 */

import Dockerode from 'dockerode';
import type { ContainerAdapter, ContainerConfig } from './container-adapter.js';
import { logger as rootLogger } from './logger.js';

/** Name of the dedicated Docker network for plugin containers. */
const PLUGIN_NETWORK = 'plexica-plugins';

/** Prefix used for naming all plugin containers. */
const CONTAINER_PREFIX = 'plexica-plugin-';

/**
 * Convert a human-readable memory string (e.g. '512m', '1g') to bytes.
 * Returns 0 (no limit) if the string is not recognised.
 */
function parseMemoryBytes(memory: string): number {
  const lower = memory.toLowerCase().trim();
  const num = parseFloat(lower);
  if (isNaN(num)) return 0;
  if (lower.endsWith('g')) return Math.round(num * 1024 * 1024 * 1024);
  if (lower.endsWith('m')) return Math.round(num * 1024 * 1024);
  if (lower.endsWith('k')) return Math.round(num * 1024);
  return Math.round(num);
}

/**
 * Convert a fractional CPU string (e.g. '0.5') to Docker's CpuQuota value.
 * Docker uses a 100ms period (CpuPeriod = 100000 µs); CpuQuota is the µs
 * the container is allowed to run per period.
 *   0.5 CPU → CpuQuota = 50000, CpuPeriod = 100000
 */
function parseCpuQuota(cpu: string): number {
  const val = parseFloat(cpu);
  if (isNaN(val) || val <= 0) return 0;
  return Math.round(val * 100_000);
}

export class DockerContainerAdapter implements ContainerAdapter {
  private docker: Dockerode;
  private log = rootLogger.child({ component: 'DockerContainerAdapter' });

  constructor(dockerOptions?: Dockerode.DockerOptions) {
    // Default: connect via /var/run/docker.sock
    this.docker = new Dockerode(dockerOptions);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async start(pluginId: string, config: ContainerConfig): Promise<void> {
    const containerName = `${CONTAINER_PREFIX}${pluginId}`;
    this.log.info({ pluginId, image: config.image }, 'Starting plugin container');

    try {
      // Ensure the plugin network exists
      await this.ensureNetwork();

      // Pull image if not already present locally
      await this.pullImageIfMissing(config.image);

      // Build HostConfig
      const portBindings: Record<string, { HostPort: string }[]> = {};
      const exposedPorts: Record<string, Record<string, never>> = {};

      for (const pb of config.ports ?? []) {
        const key = `${pb.container}/tcp`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(pb.host) }];
      }

      const hostConfig: Dockerode.HostConfig = {
        NetworkMode: PLUGIN_NETWORK,
        PortBindings: portBindings,
      };

      if (config.resources?.memory) {
        hostConfig.Memory = parseMemoryBytes(config.resources.memory);
      }

      if (config.resources?.cpu) {
        hostConfig.CpuPeriod = 100_000;
        hostConfig.CpuQuota = parseCpuQuota(config.resources.cpu);
      }

      // Create and start the container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.image,
        Env: Object.entries(config.env ?? {}).map(([k, v]) => `${k}=${v}`),
        ExposedPorts: exposedPorts,
        HostConfig: hostConfig,
      });

      await container.start();
      this.log.info({ pluginId, containerName }, 'Plugin container started');
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`DockerContainerAdapter.start failed for plugin ${pluginId}: ${msg}`);
    }
  }

  async stop(pluginId: string): Promise<void> {
    const containerName = `${CONTAINER_PREFIX}${pluginId}`;
    this.log.info({ pluginId }, 'Stopping plugin container');

    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 10 }); // 10-second graceful timeout
      this.log.info({ pluginId }, 'Plugin container stopped');
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      // Silently ignore "container not running" or "no such container" errors
      if (
        msg.includes('container already stopped') ||
        msg.includes('No such container') ||
        msg.includes('is not running')
      ) {
        this.log.debug({ pluginId }, 'Container was already stopped or does not exist');
        return;
      }
      throw new Error(`DockerContainerAdapter.stop failed for plugin ${pluginId}: ${msg}`);
    }
  }

  async health(pluginId: string): Promise<'healthy' | 'unhealthy' | 'starting'> {
    const containerName = `${CONTAINER_PREFIX}${pluginId}`;

    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();

      // If Docker has a native health check, use it
      const healthStatus = info.State?.Health?.Status;
      if (healthStatus) {
        if (healthStatus === 'healthy') return 'healthy';
        if (healthStatus === 'starting') return 'starting';
        return 'unhealthy';
      }

      // No health check configured — derive from running state
      return info.State?.Running ? 'healthy' : 'unhealthy';
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      this.log.warn({ pluginId, error: msg }, 'Health check failed');
      return 'unhealthy';
    }
  }

  async remove(pluginId: string): Promise<void> {
    const containerName = `${CONTAINER_PREFIX}${pluginId}`;
    this.log.info({ pluginId }, 'Removing plugin container');

    try {
      const container = this.docker.getContainer(containerName);
      await container.remove({ force: true });
      this.log.info({ pluginId }, 'Plugin container removed');
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      if (msg.includes('No such container')) {
        this.log.warn({ pluginId }, 'Container not found during remove — skipping');
        return;
      }
      throw new Error(`DockerContainerAdapter.remove failed for plugin ${pluginId}: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Ensure the `plexica-plugins` network exists, creating it if needed. */
  private async ensureNetwork(): Promise<void> {
    const networks = await this.docker.listNetworks({
      filters: { name: [PLUGIN_NETWORK] },
    });

    const exists = networks.some((n) => n.Name === PLUGIN_NETWORK);
    if (!exists) {
      this.log.info({ network: PLUGIN_NETWORK }, 'Creating plugin Docker network');
      await this.docker.createNetwork({
        Name: PLUGIN_NETWORK,
        Driver: 'bridge',
        Internal: true, // Prevent containers from reaching the external internet
      });
    }
  }

  /** Pull an image from the registry only if it is not already present locally. */
  private async pullImageIfMissing(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      this.log.debug({ image }, 'Image already present locally, skipping pull');
    } catch {
      this.log.info({ image }, 'Pulling Docker image');
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          // Wait for pull to complete by following the stream
          this.docker.modem.followProgress(stream, (progressErr: Error | null) => {
            if (progressErr) return reject(progressErr);
            resolve();
          });
        });
      });
      this.log.info({ image }, 'Docker image pulled successfully');
    }
  }
}

/**
 * Container Adapter Interface (ADR-019)
 *
 * Defines the contract for starting, stopping, health-checking, and removing
 * plugin containers. The concrete implementation is selected at runtime via the
 * CONTAINER_ADAPTER environment variable:
 *   - 'docker'  → DockerContainerAdapter (T004-07)
 *   - anything else (default) → NullContainerAdapter (no-op, safe for tests)
 *
 * Constitution Compliance:
 * - Article 1.2 §4: Plugin isolation (each plugin runs in its own container)
 * - Article 6.3: Structured Pino logging
 */

/**
 * Resource limits for a plugin container (FR-017).
 *
 * - `cpu`: fractional CPU cores expressed as a string, e.g. '0.5' = 50% of one CPU.
 * - `memory`: memory limit expressed as a string, e.g. '512m', '1g'.
 */
export interface ContainerResources {
  cpu?: string;
  memory?: string;
}

/**
 * Port binding mapping from a container port to a host port.
 */
export interface PortBinding {
  container: number;
  host: number;
}

/**
 * Full configuration required to start a plugin container.
 */
export interface ContainerConfig {
  /** Docker image reference, e.g. 'plexica/crm-plugin:1.2.0' */
  image: string;
  /** Environment variables injected into the container */
  env?: Record<string, string>;
  /** Port bindings (container port → host port) */
  ports?: PortBinding[];
  /** CPU and memory resource limits */
  resources?: ContainerResources;
}

/**
 * Pluggable container adapter interface (ADR-019).
 * All implementations must be safe to call concurrently for different pluginIds.
 */
export interface ContainerAdapter {
  /**
   * Pull the image (if needed), create, and start the container.
   * Idempotent: if the container is already running this should not throw.
   */
  start(pluginId: string, config: ContainerConfig): Promise<void>;

  /**
   * Gracefully stop the container (should not throw if the container is
   * already stopped or does not exist).
   */
  stop(pluginId: string): Promise<void>;

  /**
   * Return the current health of the container.
   * - 'healthy'   → container is running and passed its health check
   * - 'starting'  → container is running but health check has not passed yet
   * - 'unhealthy' → container is running but health check is failing
   */
  health(pluginId: string): Promise<'healthy' | 'unhealthy' | 'starting'>;

  /**
   * Remove the container (should not throw if not found).
   */
  remove(pluginId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// NullContainerAdapter — no-op implementation for tests and non-Docker envs
// ---------------------------------------------------------------------------

/**
 * A no-op ContainerAdapter that logs operations and resolves immediately.
 * Used when CONTAINER_ADAPTER is not set to 'docker'.
 */
export class NullContainerAdapter implements ContainerAdapter {
  async start(pluginId: string, _config: ContainerConfig): Promise<void> {
    // No-op: intentionally empty — null adapter does nothing
    void pluginId;
  }

  async stop(pluginId: string): Promise<void> {
    void pluginId;
  }

  async health(_pluginId: string): Promise<'healthy' | 'unhealthy' | 'starting'> {
    return 'healthy';
  }

  async remove(pluginId: string): Promise<void> {
    void pluginId;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create the appropriate ContainerAdapter based on the CONTAINER_ADAPTER env var.
 *
 * - CONTAINER_ADAPTER=docker  → DockerContainerAdapter (implemented in T004-07)
 * - anything else             → NullContainerAdapter (default, safe for tests)
 */
export function createContainerAdapter(): ContainerAdapter {
  const adapterType = process.env.CONTAINER_ADAPTER;

  if (adapterType === 'docker') {
    // Lazy import to avoid pulling in dockerode when running tests without Docker.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DockerContainerAdapter } = require('./docker-container-adapter.js') as {
      DockerContainerAdapter: new () => ContainerAdapter;
    };
    return new DockerContainerAdapter();
  }

  // Default: null adapter (no Docker required)
  return new NullContainerAdapter();
}

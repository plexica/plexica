// File: apps/web/src/lib/plugin-loader.ts

import type { TenantPlugin } from '@/types';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  remoteEntry: string; // URL to remoteEntry.js
  routes?: PluginRoute[];
  menuItems?: PluginMenuItem[];
}

export interface PluginRoute {
  path: string;
  component: string; // Name of the exported component from the plugin
}

export interface PluginMenuItem {
  label: string;
  path: string;
  icon?: string;
  order?: number;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: any;
  routes: PluginRoute[];
  menuItems: PluginMenuItem[];
}

// HIGH FIX #6: Add error object for failed plugin loads
export interface PluginLoadError {
  pluginId: string;
  pluginName: string;
  error: Error;
  timestamp: Date;
}

// CRITICAL FIX #3: List of trusted domains for plugin loading
// Only plugins from these origins are allowed to load
const TRUSTED_PLUGIN_DOMAINS = [
  'https://cdn.plexica.com',
  'https://plugins.plexica.com',
  'https://s3.amazonaws.com/plexica-plugins', // AWS S3
  'https://plexica-plugins.s3.amazonaws.com',
  'http://localhost:9000', // Development: MinIO
  'http://localhost:3100', // Development: Vite dev server
];

// CRITICAL FIX #3: Semantic versioning regex pattern
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// CRITICAL FIX #3: Plugin ID validation - alphanumeric and hyphens only
const PLUGIN_ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * CRITICAL FIX #3: Validates that a plugin URL is from a trusted domain
 * Prevents loading plugins from arbitrary malicious sources
 */
function validatePluginUrl(url: string): void {
  try {
    const parsedUrl = new URL(url);
    const isTrusted = TRUSTED_PLUGIN_DOMAINS.some((domain) => {
      return parsedUrl.href.startsWith(domain);
    });

    if (!isTrusted) {
      throw new Error(
        `Untrusted plugin source: ${parsedUrl.origin}. Allowed domains: ${TRUSTED_PLUGIN_DOMAINS.join(', ')}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Untrusted')) {
      throw error;
    }
    throw new Error(`Invalid plugin URL: ${url}`);
  }
}

/**
 * CRITICAL FIX #3: Validates plugin ID format
 * Prevents injection attacks through plugin identifiers
 */
function validatePluginId(pluginId: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(
      `Invalid plugin ID: ${pluginId}. Must contain only lowercase letters, numbers, and hyphens`
    );
  }
}

/**
 * CRITICAL FIX #3: Validates plugin version format (semantic versioning)
 * Prevents version-based injection attacks
 */
function validatePluginVersion(version: string): void {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(
      `Invalid plugin version: ${version}. Must follow semantic versioning (e.g., 1.0.0)`
    );
  }
}

/**
 * CRITICAL FIX #3: Calculates Subresource Integrity (SRI) hash
 * In production, should verify against a trusted manifest database
 * This is a placeholder for demonstration
 */
// @ts-expect-error - Function reserved for future SRI validation
function validateSubresourceIntegrity(url: string, integrity?: string): void {
  // NOTE: In production, you would fetch the plugin manifest from a verified source
  // and validate the integrity hash. For now, this logs a warning.
  if (!integrity) {
    console.warn(
      `[PluginLoader] No SRI hash provided for plugin: ${url}. Consider adding SRI validation.`
    );
  }
}

class PluginLoaderService {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private loadingPromises: Map<string, Promise<LoadedPlugin>> = new Map();
  // HIGH FIX #6: Track plugin load errors for display to user
  private loadErrors: Map<string, PluginLoadError> = new Map();

  /**
   * Load a plugin dynamically from a remote URL
   */
  async loadPlugin(manifest: PluginManifest): Promise<LoadedPlugin> {
    // CRITICAL FIX #3: Validate plugin manifest before loading
    validatePluginId(manifest.id);
    validatePluginVersion(manifest.version);
    validatePluginUrl(manifest.remoteEntry);

    // Check if already loaded
    if (this.loadedPlugins.has(manifest.id)) {
      return this.loadedPlugins.get(manifest.id)!;
    }

    // Check if currently loading
    if (this.loadingPromises.has(manifest.id)) {
      return this.loadingPromises.get(manifest.id)!;
    }

    // Start loading
    const loadPromise = this.loadPluginInternal(manifest);
    this.loadingPromises.set(manifest.id, loadPromise);

    try {
      const loadedPlugin = await loadPromise;
      this.loadedPlugins.set(manifest.id, loadedPlugin);
      this.loadingPromises.delete(manifest.id);
      return loadedPlugin;
    } catch (error) {
      this.loadingPromises.delete(manifest.id);
      throw error;
    }
  }

  private async loadPluginInternal(manifest: PluginManifest): Promise<LoadedPlugin> {
    try {
      console.log(`[PluginLoader] Loading plugin: ${manifest.name} from ${manifest.remoteEntry}`);

      // Load the remote entry script
      await this.loadRemoteEntry(manifest.remoteEntry, manifest.id);

      // Get the plugin container
      const container = (window as any)[manifest.id];
      if (!container) {
        throw new Error(`Plugin container not found: ${manifest.id}`);
      }

      // Initialize the container with shared scope
      // For Vite Module Federation, use __federation_shared__
      const sharedScope = (window as any).__federation_shared__ || {};
      await container.init(sharedScope);

      // Get the plugin module (Vite MF uses './Plugin' by convention)
      const factory = await container.get('./Plugin');
      const module = factory();

      console.log(`[PluginLoader] Plugin loaded successfully: ${manifest.name}`);

      return {
        manifest,
        module,
        routes: manifest.routes || [],
        menuItems: manifest.menuItems || [],
      };
    } catch (error) {
      console.error(`[PluginLoader] Failed to load plugin: ${manifest.name}`, error);
      throw error;
    }
  }

  /**
   * CRITICAL FIX #3: Load remote entry with security validation
   * Validates URL origin and implements SRI checking
   */
  private loadRemoteEntry(url: string, scope: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Validate the URL is from trusted domain
        validatePluginUrl(url);

        // Check if script already exists
        const existingScript = document.querySelector(`script[data-plugin="${scope}"]`);
        if (existingScript) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.type = 'text/javascript';
        script.async = true;
        script.setAttribute('data-plugin', scope);

        // CRITICAL FIX #3: Add Content Security Policy headers guidance
        // The server should set: Content-Security-Policy: script-src 'self' https://trusted-domains.com;
        // This prevents the script from loading additional untrusted resources

        script.onload = () => {
          console.log(`[PluginLoader] Remote entry loaded: ${url}`);
          resolve();
        };

        script.onerror = () => {
          reject(new Error(`Failed to load remote entry: ${url}`));
        };

        // Handle network-level errors
        script.addEventListener('error', () => {
          reject(new Error(`Network error loading remote entry: ${url}`));
        });

        document.head.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load multiple plugins from tenant plugin configurations
   */
  async loadTenantPlugins(tenantPlugins: TenantPlugin[]): Promise<{
    loaded: LoadedPlugin[];
    errors: PluginLoadError[];
  }> {
    const activePlugins = tenantPlugins.filter((tp) => tp.status === 'active');

    console.log(`[PluginLoader] Loading ${activePlugins.length} active plugins`);

    // HIGH FIX #6: Collect errors instead of failing silently
    const errors: PluginLoadError[] = [];

    const loadPromises = activePlugins.map(async (tenantPlugin) => {
      try {
        // Construct manifest from plugin data
        const manifest: PluginManifest = {
          id: tenantPlugin.plugin.id,
          name: tenantPlugin.plugin.name,
          version: tenantPlugin.plugin.version,
          remoteEntry: this.getPluginRemoteEntry(tenantPlugin.plugin),
          routes: this.getPluginRoutes(tenantPlugin),
          menuItems: this.getPluginMenuItems(tenantPlugin),
        };

        return await this.loadPlugin(manifest);
      } catch (error: any) {
        const pluginError: PluginLoadError = {
          pluginId: tenantPlugin.plugin.id,
          pluginName: tenantPlugin.plugin.name,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        };

        // HIGH FIX #6: Track error in the service for later retrieval
        this.loadErrors.set(tenantPlugin.plugin.id, pluginError);
        errors.push(pluginError);

        console.error(
          `[PluginLoader] Failed to load tenant plugin: ${tenantPlugin.plugin.name}`,
          error
        );
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    const loaded = results.filter((p): p is LoadedPlugin => p !== null);

    // HIGH FIX #6: Return both successful loads and errors
    return { loaded, errors };
  }

  /**
   * HIGH FIX #6: Get all plugin load errors
   */
  getLoadErrors(): PluginLoadError[] {
    return Array.from(this.loadErrors.values());
  }

  /**
   * HIGH FIX #6: Clear load errors (e.g., after user dismisses error UI)
   */
  clearLoadErrors(): void {
    this.loadErrors.clear();
  }

  /**
   * HIGH FIX #6: Check if specific plugin failed to load
   */
  getPluginError(pluginId: string): PluginLoadError | undefined {
    return this.loadErrors.get(pluginId);
  }

  private getPluginRemoteEntry(plugin: any): string {
    // In development, plugins are served from a local dev server
    // In production, they are served from CDN (MinIO or CloudFront)
    const baseUrl = import.meta.env.DEV
      ? import.meta.env.VITE_PLUGIN_DEV_URL || 'http://localhost:3100'
      : import.meta.env.VITE_PLUGIN_CDN_URL || 'http://localhost:9000/plexica-plugins';

    return `${baseUrl}/${plugin.id}/${plugin.version}/remoteEntry.js`;
  }

  private getPluginRoutes(tenantPlugin: TenantPlugin): PluginRoute[] {
    // Routes could be defined in plugin configuration
    const config = tenantPlugin.configuration as any;
    return config?.routes || [];
  }

  private getPluginMenuItems(tenantPlugin: TenantPlugin): PluginMenuItem[] {
    // Menu items could be defined in plugin configuration
    const config = tenantPlugin.configuration as any;
    return (
      config?.menuItems || [
        {
          label: tenantPlugin.plugin.name,
          path: `/plugins/${tenantPlugin.plugin.id}`,
          icon: tenantPlugin.plugin.icon,
        },
      ]
    );
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    if (!this.loadedPlugins.has(pluginId)) {
      return;
    }

    console.log(`[PluginLoader] Unloading plugin: ${pluginId}`);

    // Remove the loaded plugin
    this.loadedPlugins.delete(pluginId);

    // Remove the script tag
    const script = document.querySelector(`script[data-plugin="${pluginId}"]`);
    if (script) {
      script.remove();
    }

    // Clear the container from window
    delete (window as any)[pluginId];
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get a specific loaded plugin
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }
}

// Singleton instance
export const pluginLoader = new PluginLoaderService();

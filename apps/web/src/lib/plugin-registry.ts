// File: apps/web/src/lib/plugin-registry.ts

import type { LoadedPlugin, PluginManifest } from './plugin-loader';
import { pluginLoader } from './plugin-loader';
import { apiClient } from './api-client';

export interface PluginFilter {
  status?: 'active' | 'inactive' | 'installing' | 'error';
  category?: string;
  search?: string;
}

export interface PluginRegistrationData {
  manifest: PluginManifest;
  tenantPluginId?: string;
}

/**
 * Frontend Plugin Registry Service
 * Manages plugin registration, lifecycle, and integration with backend API
 */
class PluginRegistryService {
  private plugins: Map<string, PluginRegistrationData> = new Map();

  /**
   * Register a plugin in the frontend registry
   */
  async registerPlugin(data: PluginRegistrationData): Promise<void> {
    const { manifest } = data;

    console.log(`[PluginRegistry] Registering plugin: ${manifest.name} (${manifest.id})`);

    this.plugins.set(manifest.id, data);
  }

  /**
   * Unregister a plugin from the frontend registry
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    console.log(`[PluginRegistry] Unregistering plugin: ${pluginId}`);

    this.plugins.delete(pluginId);

    // Also unload the plugin if it's loaded
    if (pluginLoader.isPluginLoaded(pluginId)) {
      await pluginLoader.unloadPlugin(pluginId);
    }
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): PluginRegistrationData | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all registered plugins with optional filtering
   */
  listPlugins(filter?: PluginFilter): PluginRegistrationData[] {
    let plugins = Array.from(this.plugins.values());

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      plugins = plugins.filter(
        (p) =>
          p.manifest.name.toLowerCase().includes(searchLower) ||
          p.manifest.id.toLowerCase().includes(searchLower)
      );
    }

    return plugins;
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return pluginLoader.getLoadedPlugins();
  }

  /**
   * Check if a plugin is registered
   */
  isPluginRegistered(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Initialize plugins from backend API
   * Fetches active tenant plugins and loads them
   */
  async initializeFromBackend(tenantId: string): Promise<void> {
    try {
      console.log('[PluginRegistry] Initializing plugins from backend...');

      // Fetch active tenant plugins from backend
      const tenantPlugins = await apiClient.getTenantPlugins(tenantId);

      console.log(`[PluginRegistry] Found ${tenantPlugins.length} tenant plugins`);

      // Register each plugin
      for (const tenantPlugin of tenantPlugins) {
        if (tenantPlugin.status === 'active' && tenantPlugin.plugin) {
          const manifest: PluginManifest = {
            id: tenantPlugin.plugin.id,
            name: tenantPlugin.plugin.name,
            version: tenantPlugin.plugin.version,
            remoteEntry: this.getRemoteEntryUrl(tenantPlugin.plugin),
            routes: this.extractRoutes(tenantPlugin),
            menuItems: this.extractMenuItems(tenantPlugin),
          };

          await this.registerPlugin({
            manifest,
            tenantPluginId: tenantPlugin.id,
          });
        }
      }

      console.log(`[PluginRegistry] Initialized ${this.plugins.size} plugins`);
    } catch (error) {
      console.error('[PluginRegistry] Failed to initialize from backend:', error);
      throw error;
    }
  }

  /**
   * Load all registered plugins
   */
  async loadAllPlugins(): Promise<LoadedPlugin[]> {
    const plugins = Array.from(this.plugins.values());
    const loadPromises = plugins.map(async (data) => {
      try {
        return await pluginLoader.loadPlugin(data.manifest);
      } catch (error) {
        console.error(`[PluginRegistry] Failed to load plugin: ${data.manifest.name}`, error);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    return results.filter((p): p is LoadedPlugin => p !== null);
  }

  /**
   * Get remote entry URL for a plugin
   */
  private getRemoteEntryUrl(plugin: any): string {
    const baseUrl = import.meta.env.DEV
      ? import.meta.env.VITE_PLUGIN_DEV_URL || 'http://localhost:3100'
      : import.meta.env.VITE_PLUGIN_CDN_URL || 'http://localhost:9000/plexica-plugins';

    return `${baseUrl}/${plugin.id}/${plugin.version}/remoteEntry.js`;
  }

  /**
   * Extract routes from tenant plugin configuration
   */
  private extractRoutes(tenantPlugin: any): any[] {
    const config = tenantPlugin.configuration || {};
    return config.routes || [];
  }

  /**
   * Extract menu items from tenant plugin configuration
   */
  private extractMenuItems(tenantPlugin: any): any[] {
    const config = tenantPlugin.configuration || {};
    return (
      config.menuItems || [
        {
          label: tenantPlugin.plugin.name,
          path: `/plugins/${tenantPlugin.plugin.id}`,
          icon: tenantPlugin.plugin.icon,
        },
      ]
    );
  }

  /**
   * Clear all registered plugins
   */
  clear(): void {
    this.plugins.clear();
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistryService();

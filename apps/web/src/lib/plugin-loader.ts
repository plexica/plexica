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

class PluginLoaderService {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private loadingPromises: Map<string, Promise<LoadedPlugin>> = new Map();

  /**
   * Load a plugin dynamically from a remote URL
   */
  async loadPlugin(manifest: PluginManifest): Promise<LoadedPlugin> {
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

      // Initialize the container
      await container.init(__webpack_share_scopes__.default);

      // Get the plugin module
      const factory = await container.get('./plugin');
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

  private loadRemoteEntry(url: string, scope: string): Promise<void> {
    return new Promise((resolve, reject) => {
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

      script.onload = () => {
        console.log(`[PluginLoader] Remote entry loaded: ${url}`);
        resolve();
      };

      script.onerror = () => {
        reject(new Error(`Failed to load remote entry: ${url}`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Load multiple plugins from tenant plugin configurations
   */
  async loadTenantPlugins(tenantPlugins: TenantPlugin[]): Promise<LoadedPlugin[]> {
    const activePlugins = tenantPlugins.filter((tp) => tp.status === 'active');

    console.log(`[PluginLoader] Loading ${activePlugins.length} active plugins`);

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
      } catch (error) {
        console.error(
          `[PluginLoader] Failed to load tenant plugin: ${tenantPlugin.plugin.name}`,
          error
        );
        return null;
      }
    });

    const results = await Promise.all(loadPromises);
    return results.filter((p): p is LoadedPlugin => p !== null);
  }

  private getPluginRemoteEntry(plugin: any): string {
    // In development, plugins are served from a local dev server
    // In production, they would be served from CDN or plugin registry
    const baseUrl = import.meta.env.DEV
      ? 'http://localhost:3100' // Dev server for plugins
      : `${import.meta.env.VITE_PLUGIN_CDN_URL || '/plugins'}`;

    return `${baseUrl}/${plugin.id}/remoteEntry.js`;
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

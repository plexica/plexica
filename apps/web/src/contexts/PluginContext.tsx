// File: apps/web/src/contexts/PluginContext.tsx

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { pluginRegistry } from '../lib/plugin-registry';
import { pluginRouteManager } from '../lib/plugin-routes';
import { pluginMenuManager } from '../lib/plugin-menu';
import type { LoadedPlugin } from '../lib/plugin-loader';
import type { DynamicMenuItem } from '../lib/plugin-menu';

interface PluginContextValue {
  plugins: LoadedPlugin[];
  menuItems: DynamicMenuItem[];
  isLoading: boolean;
  error: string | null;
  refreshPlugins: () => Promise<void>;
}

const PluginContext = createContext<PluginContextValue | null>(null);

export function PluginProvider({ children }: { children: ReactNode }) {
  const { tenant } = useAuthStore();
  const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
  const [menuItems, setMenuItems] = useState<DynamicMenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    if (!tenant?.id) {
      console.log('[PluginContext] No tenant, skipping plugin load');
      setPlugins([]);
      setMenuItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('[PluginContext] Loading plugins for tenant:', tenant.id);

      // Initialize from backend
      await pluginRegistry.initializeFromBackend(tenant.id);

      // Load all plugins
      const loadedPlugins = await pluginRegistry.loadAllPlugins();

      console.log('[PluginContext] Loaded plugins:', loadedPlugins.length);

      // Register routes and menus
      loadedPlugins.forEach((plugin) => {
        pluginRouteManager.registerPluginRoutes(plugin);
        pluginMenuManager.registerPluginMenuItems(plugin);
      });

      setPlugins(loadedPlugins);
      setMenuItems(pluginMenuManager.getAllMenuItems());
      setIsLoading(false);
    } catch (err: any) {
      console.error('[PluginContext] Failed to load plugins:', err);
      setError(err.message || 'Failed to load plugins');
      setIsLoading(false);
    }
  }, [tenant?.id]);

  // Load plugins when tenant changes
  useEffect(() => {
    loadPlugins();

    return () => {
      // Cleanup on unmount
      pluginRegistry.clear();
      pluginRouteManager.clear();
      pluginMenuManager.clear();
    };
  }, [loadPlugins]);

  // Subscribe to menu changes
  useEffect(() => {
    const unsubscribe = pluginMenuManager.subscribe(() => {
      setMenuItems(pluginMenuManager.getAllMenuItems());
    });

    return unsubscribe;
  }, []);

  const value: PluginContextValue = {
    plugins,
    menuItems,
    isLoading,
    error,
    refreshPlugins: loadPlugins,
  };

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

export function usePlugins() {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugins must be used within PluginProvider');
  }
  return context;
}

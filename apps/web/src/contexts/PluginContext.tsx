// File: apps/web/src/contexts/PluginContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuthStore } from '../stores/auth-store';
import { pluginRegistry } from '../lib/plugin-registry';
import { pluginRouteManager } from '../lib/plugin-routes';
import { pluginMenuManager } from '../lib/plugin-menu';
import type { LoadedPlugin, PluginLoadError } from '../lib/plugin-loader';
import { pluginLoader } from '../lib/plugin-loader';
import type { DynamicMenuItem } from '../lib/plugin-menu';

interface PluginContextValue {
  plugins: LoadedPlugin[];
  menuItems: DynamicMenuItem[];
  loadErrors: PluginLoadError[];
  isLoading: boolean;
  error: string | null;
  refreshPlugins: () => Promise<void>;
  clearLoadErrors: () => void;
}

const PluginContext = createContext<PluginContextValue | null>(null);

export function PluginProvider({ children }: { children: ReactNode }) {
  const { tenant } = useAuthStore();
  const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
  const [menuItems, setMenuItems] = useState<DynamicMenuItem[]>([]);
  const [loadErrors, setLoadErrors] = useState<PluginLoadError[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // HIGH FIX #7: Use AbortController to cancel in-flight plugin loading
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const loadPlugins = useCallback(async () => {
    if (!tenant?.id) {
      console.log('[PluginContext] No tenant, skipping plugin load');
      setPlugins([]);
      setMenuItems([]);
      setIsLoading(false);
      return;
    }

    try {
      // HIGH FIX #7: Cancel previous request if still in flight
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

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
      // Capture any load errors from the plugin loader
      setLoadErrors(pluginLoader.getLoadErrors());
      setIsLoading(false);
    } catch (err: any) {
      // HIGH FIX #7: Don't set error if request was aborted
      if (err.name !== 'AbortError') {
        console.error('[PluginContext] Failed to load plugins:', err);
        setError(err.message || 'Failed to load plugins');
        setIsLoading(false);
      }
    }
  }, [tenant?.id]);

  // Load plugins when tenant changes
  useEffect(() => {
    loadPlugins();

    return () => {
      // HIGH FIX #7: Cleanup - abort in-flight requests on unmount
      abortControllerRef.current?.abort();
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

  const clearLoadErrors = useCallback(() => {
    pluginLoader.clearLoadErrors();
    setLoadErrors([]);
  }, []);

  const value: PluginContextValue = {
    plugins,
    menuItems,
    loadErrors,
    isLoading,
    error,
    refreshPlugins: loadPlugins,
    clearLoadErrors,
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

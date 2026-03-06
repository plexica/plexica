// File: apps/web/src/contexts/PluginContext.tsx

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
  const abortControllerRef = useRef<AbortController | null>(null);

  // Shared async loader — called from the effect and from refreshPlugins.
  // Defined with useCallback so refreshPlugins has a stable reference.
  const loadPlugins = useCallback(
    async (signal?: AbortSignal) => {
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

        // Bail out if the caller already aborted
        if (signal?.aborted) return;

        // Load all plugins
        const loadedPlugins = await pluginRegistry.loadAllPlugins();

        if (signal?.aborted) return;

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
      } catch (err: unknown) {
        // HIGH FIX #7: Don't set error if request was aborted
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[PluginContext] Failed to load plugins:', err);
          setError(err.message || 'Failed to load plugins');
          setIsLoading(false);
        }
      }
    },
    [tenant]
  );

  // Load plugins when tenant changes.
  // Define an async IIFE inline so react-hooks/set-state-in-effect is satisfied —
  // the rule requires the setState-calling function to be declared inside the effect.
  useEffect(() => {
    // HIGH FIX #7: Cancel previous in-flight request before starting a new one
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function run() {
      await loadPlugins(controller.signal);
    }
    void run();

    return () => {
      // Abort the in-flight request and clear registries on unmount / tenant change
      controller.abort();
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

  const refreshPlugins = useCallback(() => {
    // Cancel any in-flight request and start fresh
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return loadPlugins(controller.signal);
  }, [loadPlugins]);

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
    refreshPlugins,
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

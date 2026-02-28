// File: apps/web/src/lib/plugin-routes.tsx

import { Suspense, lazy, type ComponentType } from 'react';
import type { LoadedPlugin } from './plugin-loader';
import { pluginLoader } from './plugin-loader';

// ---------------------------------------------------------------------------
// Reserved routes (FR-008) — plugins may NOT register these prefixes
// ---------------------------------------------------------------------------

export const RESERVED_ROUTES = [
  '/',
  '/settings',
  '/admin',
  '/profile',
  '/team',
  '/login',
  '/auth',
] as const;

/**
 * Returns `true` when `prefix` matches a reserved core shell route.
 * Normalises trailing slashes before comparing.
 */
export function isReservedRoute(prefix: string): boolean {
  const normalised = prefix.replace(/\/+$/, '') || '/';
  return (RESERVED_ROUTES as readonly string[]).includes(normalised);
}

/**
 * Returns `true` when `prefix` is already claimed by an existing registered plugin.
 * Uses the singleton `pluginRouteManager` instance — call after construction.
 */
export function hasConflict(prefix: string, existingRoutes: Map<string, unknown>): boolean {
  const normalised = prefix.replace(/\/+$/, '') || '/';
  for (const [, route] of existingRoutes) {
    const r = route as { path: string };
    if (r.path === normalised) return true;
  }
  return false;
}

/**
 * Attempt to register a plugin prefix.
 * Returns `true` on success; `false` + `console.warn` on rejection.
 */
export function registerPlugin(
  pluginId: string,
  prefix: string,
  existingRoutes: Map<string, unknown>
): boolean {
  if (isReservedRoute(prefix)) {
    console.warn(
      `[PluginRoutes] Rejected plugin "${pluginId}" — prefix "${prefix}" is a reserved route. ` +
        `Reserved routes: ${RESERVED_ROUTES.join(', ')}`
    );
    return false;
  }
  if (hasConflict(prefix, existingRoutes)) {
    console.warn(
      `[PluginRoutes] Rejected plugin "${pluginId}" — prefix "${prefix}" conflicts with an already-registered plugin.`
    );
    return false;
  }
  return true;
}

export interface DynamicPluginRoute {
  path: string;
  pluginId: string;
  componentName: string;
  title: string;
  layout?: 'default' | 'fullscreen' | 'minimal';
  permissions?: string[];
}

/**
 * Plugin Route Manager
 * Manages dynamic registration and rendering of plugin routes
 */
class PluginRouteManager {
  private routes: Map<string, DynamicPluginRoute> = new Map();
  private componentCache: Map<string, ComponentType<any>> = new Map();

  /**
   * Register routes from a loaded plugin
   */
  registerPluginRoutes(loadedPlugin: LoadedPlugin): void {
    const { manifest, routes } = loadedPlugin;

    console.log(`[PluginRoutes] Registering ${routes.length} routes for plugin: ${manifest.id}`);

    routes.forEach((route) => {
      const fullPath = this.normalizePath(route.path);
      const routeKey = `${manifest.id}:${fullPath}`;

      const dynamicRoute: DynamicPluginRoute = {
        path: fullPath,
        pluginId: manifest.id,
        componentName: route.component || 'default',
        title: (route as any).title || manifest.name,
        layout: (route as any).layout || 'default',
        permissions: (route as any).permissions,
      };

      this.routes.set(routeKey, dynamicRoute);
      console.log(
        `[PluginRoutes] Registered route: ${fullPath} -> ${manifest.id}.${dynamicRoute.componentName}`
      );
    });
  }

  /**
   * Unregister all routes for a plugin
   */
  unregisterPluginRoutes(pluginId: string): void {
    console.log(`[PluginRoutes] Unregistering routes for plugin: ${pluginId}`);

    const routesToRemove: string[] = [];
    this.routes.forEach((route, key) => {
      if (route.pluginId === pluginId) {
        routesToRemove.push(key);
      }
    });

    routesToRemove.forEach((key) => {
      this.routes.delete(key);
      // Also clear component cache
      this.componentCache.delete(key);
    });

    console.log(`[PluginRoutes] Unregistered ${routesToRemove.length} routes`);
  }

  /**
   * Get all registered routes
   */
  getAllRoutes(): DynamicPluginRoute[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get routes for a specific plugin
   */
  getPluginRoutes(pluginId: string): DynamicPluginRoute[] {
    return Array.from(this.routes.values()).filter((route) => route.pluginId === pluginId);
  }

  /**
   * Find a route by path
   */
  findRoute(path: string): DynamicPluginRoute | undefined {
    const normalizedPath = this.normalizePath(path);

    // Try exact match first
    for (const [, route] of this.routes) {
      if (route.path === normalizedPath) {
        return route;
      }
    }

    // Try pattern matching (for routes with params)
    for (const [, route] of this.routes) {
      if (this.matchPath(route.path, normalizedPath)) {
        return route;
      }
    }

    return undefined;
  }

  /**
   * Get a component for a specific route
   */
  async getRouteComponent(route: DynamicPluginRoute): Promise<ComponentType<any>> {
    const cacheKey = `${route.pluginId}:${route.path}`;

    // Check cache
    if (this.componentCache.has(cacheKey)) {
      return this.componentCache.get(cacheKey)!;
    }

    // Load plugin if not already loaded
    const loadedPlugin = pluginLoader.getPlugin(route.pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin not loaded: ${route.pluginId}`);
    }

    // Get the component from the plugin module
    const component = await this.loadComponentFromPlugin(loadedPlugin, route.componentName);

    // Cache it
    this.componentCache.set(cacheKey, component);

    return component;
  }

  /**
   * Create a lazy-loaded component wrapper for a route
   */
  createLazyComponent(route: DynamicPluginRoute): ComponentType<any> {
    const LazyComponent = lazy(async () => {
      const component = await this.getRouteComponent(route);
      return { default: component };
    });

    // Return a wrapper with Suspense
    return (props: any) => (
      <Suspense fallback={<PluginLoadingFallback title={route.title} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  }

  /**
   * Load a component from a plugin module
   */
  private async loadComponentFromPlugin(
    loadedPlugin: LoadedPlugin,
    componentName: string
  ): Promise<ComponentType<any>> {
    const { module, manifest } = loadedPlugin;

    // Try to get the component from the module
    let component: ComponentType<any> | undefined;

    if (componentName === 'default' || componentName === 'Default') {
      component = module.default || module;
    } else {
      component = module[componentName];
    }

    if (!component) {
      throw new Error(
        `Component "${componentName}" not found in plugin "${manifest.id}". Available exports: ${Object.keys(module).join(', ')}`
      );
    }

    return component;
  }

  /**
   * Normalize a path (ensure it starts with /)
   */
  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  /**
   * Simple path matching (supports :param syntax)
   */
  private matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    return patternParts.every((part, i) => {
      if (part.startsWith(':')) {
        return true; // Param match
      }
      return part === pathParts[i];
    });
  }

  /**
   * Clear all routes and cache
   */
  clear(): void {
    this.routes.clear();
    this.componentCache.clear();
  }
}

/**
 * Loading fallback component for plugins
 */
function PluginLoadingFallback({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4 mx-auto"></div>
        <p className="text-muted-foreground">Loading {title}...</p>
      </div>
    </div>
  );
}

// Singleton instance
export const pluginRouteManager = new PluginRouteManager();

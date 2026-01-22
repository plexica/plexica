// File: apps/web/src/lib/plugin-menu.tsx

import type { LoadedPlugin } from './plugin-loader';

export interface DynamicMenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  onClick?: () => void;
  children?: DynamicMenuItem[];
  permissions?: string[];
  order?: number;
  pluginId?: string;
  badge?: string | number;
  badgeVariant?: 'default' | 'success' | 'warning' | 'error';
}

/**
 * Plugin Menu Manager
 * Manages dynamic registration and rendering of plugin menu items
 */
class PluginMenuManager {
  private menuItems: Map<string, DynamicMenuItem> = new Map();
  private changeListeners: Set<() => void> = new Set();

  /**
   * Register menu items from a loaded plugin
   */
  registerPluginMenuItems(loadedPlugin: LoadedPlugin): void {
    const { manifest, menuItems } = loadedPlugin;

    console.log(
      `[PluginMenu] Registering ${menuItems.length} menu items for plugin: ${manifest.id}`
    );

    menuItems.forEach((item: any) => {
      const menuItem: DynamicMenuItem = {
        id: item.id || `${manifest.id}-${item.label.toLowerCase().replace(/\s+/g, '-')}`,
        label: item.label,
        icon: item.icon,
        path: item.path,
        order: item.order ?? 100,
        pluginId: manifest.id,
        children: [],
      };

      this.menuItems.set(menuItem.id, menuItem);
      console.log(`[PluginMenu] Registered menu item: ${menuItem.label} (${menuItem.id})`);
    });

    this.notifyListeners();
  }

  /**
   * Unregister all menu items for a plugin
   */
  unregisterPluginMenuItems(pluginId: string): void {
    console.log(`[PluginMenu] Unregistering menu items for plugin: ${pluginId}`);

    const itemsToRemove: string[] = [];
    this.menuItems.forEach((item, id) => {
      if (item.pluginId === pluginId) {
        itemsToRemove.push(id);
      }
    });

    itemsToRemove.forEach((id) => {
      this.menuItems.delete(id);
    });

    console.log(`[PluginMenu] Unregistered ${itemsToRemove.length} menu items`);
    this.notifyListeners();
  }

  /**
   * Get all menu items sorted by order
   */
  getAllMenuItems(): DynamicMenuItem[] {
    const items = Array.from(this.menuItems.values());
    return items.sort((a, b) => (a.order || 100) - (b.order || 100));
  }

  /**
   * Get menu items for a specific plugin
   */
  getPluginMenuItems(pluginId: string): DynamicMenuItem[] {
    return Array.from(this.menuItems.values())
      .filter((item) => item.pluginId === pluginId)
      .sort((a, b) => (a.order || 100) - (b.order || 100));
  }

  /**
   * Add a custom menu item (non-plugin)
   */
  addMenuItem(item: DynamicMenuItem): void {
    this.menuItems.set(item.id, item);
    this.notifyListeners();
  }

  /**
   * Remove a menu item by ID
   */
  removeMenuItem(itemId: string): void {
    this.menuItems.delete(itemId);
    this.notifyListeners();
  }

  /**
   * Update a menu item
   */
  updateMenuItem(itemId: string, updates: Partial<DynamicMenuItem>): void {
    const existing = this.menuItems.get(itemId);
    if (existing) {
      this.menuItems.set(itemId, { ...existing, ...updates });
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to menu changes
   */
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.changeListeners.forEach((listener) => listener());
  }

  /**
   * Clear all menu items
   */
  clear(): void {
    this.menuItems.clear();
    this.notifyListeners();
  }
}

// Singleton instance
export const pluginMenuManager = new PluginMenuManager();

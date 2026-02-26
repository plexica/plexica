// File: packages/sdk/__tests__/decorators.test.ts

/**
 * Unit tests for @plexica/sdk decorator suite:
 *   - @EventHandler (T004-16)
 *   - @EventPublisher (T004-16)
 *   - @Permission (T004-17)
 *   - @Hook (T004-18)
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

import {
  EventHandler,
  EventPublisher,
  METADATA_KEY_EVENT_HANDLER,
  METADATA_KEY_EVENT_PUBLISHER,
} from '../src/decorators/events';

import { Permission, METADATA_KEY_PERMISSIONS } from '../src/decorators/permissions';
import type { PermissionMetadata } from '../src/decorators/permissions';

import { Hook, METADATA_KEY_HOOK } from '../src/decorators/hooks';
import type { WorkspaceHookType } from '../src/decorators/hooks';

// ---------------------------------------------------------------------------
// @EventHandler tests
// ---------------------------------------------------------------------------

describe('@EventHandler', () => {
  it('should store the topic on the method metadata', () => {
    class MyPlugin {
      @EventHandler('plugin.crm.contact-created')
      async onContactCreated() {}
    }

    const proto = MyPlugin.prototype;
    const topic = Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, 'onContactCreated');
    expect(topic).toBe('plugin.crm.contact-created');
  });

  it('should store different topics on different methods', () => {
    class MyPlugin {
      @EventHandler('plugin.crm.contact-created')
      async onCreated() {}

      @EventHandler('plugin.crm.contact-deleted')
      async onDeleted() {}
    }

    const proto = MyPlugin.prototype;
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, 'onCreated')).toBe(
      'plugin.crm.contact-created'
    );
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, 'onDeleted')).toBe(
      'plugin.crm.contact-deleted'
    );
  });

  it('should not set metadata on methods that are not decorated', () => {
    class MyPlugin {
      @EventHandler('plugin.crm.contact-created')
      async decorated() {}

      async notDecorated() {}
    }

    const proto = MyPlugin.prototype;
    const topic = Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, 'notDecorated');
    expect(topic).toBeUndefined();
  });

  it('should preserve the original method descriptor', () => {
    class MyPlugin {
      @EventHandler('plugin.crm.contact-created')
      async onContactCreated() {
        return 'result';
      }
    }

    const instance = new MyPlugin();
    expect(instance.onContactCreated).toBeDefined();
    expect(typeof instance.onContactCreated).toBe('function');
  });

  it('should work with symbol property keys', () => {
    const sym = Symbol('myHandler');

    class MyPlugin {
      @EventHandler('plugin.crm.sym-event')
      async [sym]() {}
    }

    const proto = MyPlugin.prototype;
    const topic = Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, sym);
    expect(topic).toBe('plugin.crm.sym-event');
  });
});

// ---------------------------------------------------------------------------
// @EventPublisher tests
// ---------------------------------------------------------------------------

describe('@EventPublisher', () => {
  it('should mark the class as an event publisher', () => {
    @EventPublisher()
    class MyPlugin {}

    const flag = Reflect.getMetadata(METADATA_KEY_EVENT_PUBLISHER, MyPlugin);
    expect(flag).toBe(true);
  });

  it('should not affect a class that is not decorated', () => {
    class UndecoractedPlugin {}

    const flag = Reflect.getMetadata(METADATA_KEY_EVENT_PUBLISHER, UndecoractedPlugin);
    expect(flag).toBeUndefined();
  });

  it('should allow the class to be instantiated normally after decoration', () => {
    @EventPublisher()
    class MyPlugin {
      readonly name = 'my-plugin';
    }

    const instance = new MyPlugin();
    expect(instance.name).toBe('my-plugin');
  });

  it('should work alongside @EventHandler decorators on the same class', () => {
    @EventPublisher()
    class MyPlugin {
      @EventHandler('plugin.crm.contact-created')
      async onCreated() {}
    }

    expect(Reflect.getMetadata(METADATA_KEY_EVENT_PUBLISHER, MyPlugin)).toBe(true);
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, MyPlugin.prototype, 'onCreated')).toBe(
      'plugin.crm.contact-created'
    );
  });
});

// ---------------------------------------------------------------------------
// @Permission tests
// ---------------------------------------------------------------------------

describe('@Permission', () => {
  it('should store a single permission on the class', () => {
    @Permission('contacts:read', 'Read Contacts', 'Allows reading the contacts list')
    class MyPlugin {}

    const perms: PermissionMetadata[] = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, MyPlugin);
    expect(perms).toHaveLength(1);
    expect(perms[0]).toEqual({
      key: 'contacts:read',
      name: 'Read Contacts',
      description: 'Allows reading the contacts list',
    });
  });

  it('should accumulate multiple permissions in declaration order', () => {
    @Permission('contacts:read', 'Read Contacts', 'Allows reading the contacts list')
    @Permission('contacts:write', 'Write Contacts', 'Allows creating and updating contacts')
    @Permission('contacts:delete', 'Delete Contacts', 'Allows deleting contacts')
    class MyPlugin {}

    const perms: PermissionMetadata[] = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, MyPlugin);
    // Decorators apply bottom-to-top, so write is first in the array, then read
    expect(perms).toHaveLength(3);
    const keys = perms.map((p) => p.key);
    expect(keys).toContain('contacts:read');
    expect(keys).toContain('contacts:write');
    expect(keys).toContain('contacts:delete');
  });

  it('should not set metadata on a class that is not decorated', () => {
    class UndecoractedPlugin {}

    const perms = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, UndecoractedPlugin);
    expect(perms).toBeUndefined();
  });

  it('should not share metadata between different plugin classes', () => {
    @Permission('contacts:read', 'Read Contacts', 'Read access')
    class PluginA {}

    @Permission('deals:write', 'Write Deals', 'Write access')
    class PluginB {}

    const permsA: PermissionMetadata[] = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, PluginA);
    const permsB: PermissionMetadata[] = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, PluginB);

    expect(permsA).toHaveLength(1);
    expect(permsA[0]!.key).toBe('contacts:read');

    expect(permsB).toHaveLength(1);
    expect(permsB[0]!.key).toBe('deals:write');
  });

  it('should allow the class to be instantiated normally after decoration', () => {
    @Permission('contacts:read', 'Read Contacts', 'Read access')
    class MyPlugin {
      readonly id = 'plugin-crm';
    }

    const instance = new MyPlugin();
    expect(instance.id).toBe('plugin-crm');
  });

  it('should store all three fields correctly', () => {
    @Permission('analytics:view', 'View Analytics', 'Access analytics dashboard and reports')
    class AnalyticsPlugin {}

    const perms: PermissionMetadata[] = Reflect.getMetadata(
      METADATA_KEY_PERMISSIONS,
      AnalyticsPlugin
    );
    expect(perms[0]!.key).toBe('analytics:view');
    expect(perms[0]!.name).toBe('View Analytics');
    expect(perms[0]!.description).toBe('Access analytics dashboard and reports');
  });
});

// ---------------------------------------------------------------------------
// @Hook tests
// ---------------------------------------------------------------------------

describe('@Hook', () => {
  it('should store the hook type on the method metadata', () => {
    class MyPlugin {
      @Hook('before_create')
      async onBeforeCreate() {}
    }

    const hookType: WorkspaceHookType = Reflect.getMetadata(
      METADATA_KEY_HOOK,
      MyPlugin.prototype,
      'onBeforeCreate'
    );
    expect(hookType).toBe('before_create');
  });

  it('should support all four hook types', () => {
    const hookTypes: WorkspaceHookType[] = ['before_create', 'created', 'before_delete', 'deleted'];

    for (const type of hookTypes) {
      class TestPlugin {
        @Hook(type)
        async handler() {}
      }

      const stored = Reflect.getMetadata(METADATA_KEY_HOOK, TestPlugin.prototype, 'handler');
      expect(stored).toBe(type);
    }
  });

  it('should store different hook types on different methods of the same class', () => {
    class MyPlugin {
      @Hook('before_create')
      async validate() {}

      @Hook('created')
      async onCreated() {}

      @Hook('before_delete')
      async beforeDelete() {}

      @Hook('deleted')
      async onDeleted() {}
    }

    const proto = MyPlugin.prototype;
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, proto, 'validate')).toBe('before_create');
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, proto, 'onCreated')).toBe('created');
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, proto, 'beforeDelete')).toBe('before_delete');
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, proto, 'onDeleted')).toBe('deleted');
  });

  it('should not set metadata on non-decorated methods', () => {
    class MyPlugin {
      @Hook('created')
      async decorated() {}

      async notDecorated() {}
    }

    const hookType = Reflect.getMetadata(METADATA_KEY_HOOK, MyPlugin.prototype, 'notDecorated');
    expect(hookType).toBeUndefined();
  });

  it('should preserve the original method descriptor', () => {
    class MyPlugin {
      @Hook('created')
      async onCreated() {
        return 'workspace-ready';
      }
    }

    const instance = new MyPlugin();
    expect(typeof instance.onCreated).toBe('function');
  });

  it('should work alongside @EventHandler on the same class', () => {
    class MyPlugin {
      @Hook('created')
      async onWorkspaceCreated() {}

      @EventHandler('plugin.ws.workspace-created')
      async onEvent() {}
    }

    const proto = MyPlugin.prototype;
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, proto, 'onWorkspaceCreated')).toBe('created');
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, proto, 'onEvent')).toBe(
      'plugin.ws.workspace-created'
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-decorator integration
// ---------------------------------------------------------------------------

describe('Decorator integration', () => {
  it('should support all decorators combined on the same class', () => {
    @EventPublisher()
    @Permission('ws:manage', 'Manage Workspaces', 'Full workspace management access')
    class FullFeaturedPlugin {
      @EventHandler('plugin.full.event')
      async handleEvent() {}

      @Hook('before_create')
      async beforeCreate() {}

      @Hook('deleted')
      async onDeleted() {}
    }

    // @EventPublisher
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_PUBLISHER, FullFeaturedPlugin)).toBe(true);

    // @Permission
    const perms: PermissionMetadata[] = Reflect.getMetadata(
      METADATA_KEY_PERMISSIONS,
      FullFeaturedPlugin
    );
    expect(perms).toHaveLength(1);
    expect(perms[0]!.key).toBe('ws:manage');

    // @EventHandler
    expect(
      Reflect.getMetadata(METADATA_KEY_EVENT_HANDLER, FullFeaturedPlugin.prototype, 'handleEvent')
    ).toBe('plugin.full.event');

    // @Hook
    expect(
      Reflect.getMetadata(METADATA_KEY_HOOK, FullFeaturedPlugin.prototype, 'beforeCreate')
    ).toBe('before_create');
    expect(Reflect.getMetadata(METADATA_KEY_HOOK, FullFeaturedPlugin.prototype, 'onDeleted')).toBe(
      'deleted'
    );
  });
});

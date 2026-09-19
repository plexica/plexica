// helpers/connection-manager-fixtures.ts
// Shared ServerResponse mock + fixture DTO for the connection-manager unit
// tests. Test-only; nothing here is exported for production use. The mock
// records 'drain'/'close'/'error' listeners so tests can emit them.

import { vi } from 'vitest';

import type { NotificationDto } from '../../../../modules/notification/types.js';
import type { ServerResponse } from 'node:http';

export type Listener = () => void;

export interface MockRes {
  res: ServerResponse;
  end: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  listeners: { emit: (name: string) => void };
  setWritableNeedDrain: (value: boolean) => void;
}

export function mockRes(
  overrides: {
    writeResult?: boolean;
    destroyed?: boolean;
    writableEnded?: boolean;
    writableNeedDrain?: boolean;
  } = {}
): MockRes {
  const listeners: Record<string, Listener[]> = {};
  let needDrain = overrides.writableNeedDrain ?? false;
  const res = {
    destroyed: overrides.destroyed ?? false,
    writableEnded: overrides.writableEnded ?? false,
    // Getter-backed so tests can flip backpressure state (drain cleared vs
    // pending) via setWritableNeedDrain — mirrors the real writableNeedDrain.
    get writableNeedDrain() {
      return needDrain;
    },
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => overrides.writeResult ?? true),
    end: vi.fn(),
    on: vi.fn((name: string, cb: Listener) => {
      (listeners[name] ??= []).push(cb);
    }),
    removeListener: vi.fn((name: string, cb: Listener) => {
      listeners[name] = (listeners[name] ?? []).filter((fn) => fn !== cb);
    }),
  };
  return {
    res: res as unknown as ServerResponse,
    end: res.end,
    write: res.write,
    listeners: {
      emit: (name: string) => {
        for (const cb of listeners[name] ?? []) cb();
      },
    },
    setWritableNeedDrain: (value: boolean) => {
      needDrain = value;
    },
  };
}

export const DTO: NotificationDto = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'workspace.invite',
  titleKey: 'notification.workspace.invite.title',
  bodyKey: 'notification.workspace.invite.body',
  metadata: {},
  read: false,
  createdAt: '2026-09-18T00:00:00.000Z',
};

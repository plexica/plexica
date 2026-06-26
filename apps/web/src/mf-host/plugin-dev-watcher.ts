// plugin-dev-watcher.ts
// Dev-mode only WebSocket listener for dynamic MF remote registration.
// Loaded only when import.meta.env.DEV is true.

interface DevPluginRegistration {
  type: 'plugin-register';
  slug: string;
  remoteEntry: string;
  extensionPoints: string[];
}

interface DevPluginUnregistration {
  type: 'plugin-unregister';
  slug: string;
}

type DevPluginMessage = DevPluginRegistration | DevPluginUnregistration;

const activeDevPlugins = new Map<string, DevPluginRegistration>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;

function getReconnectDelay(): number {
  // Exponential backoff with jitter
  const exponential = Math.min(BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts), MAX_RECONNECT_MS);
  const jitter = exponential * 0.1 * Math.random();
  return exponential + jitter;
}

export function startDevWatcher(shellWsUrl = 'ws://localhost:3000/_plexica/dev-ws'): void {
  if (!import.meta.env.DEV) return;

  let stopped = false;

  function cleanup(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.close();
    ws = null;
  }

  function connect(): void {
    cleanup();
    if (stopped) return;

    try {
      ws = new WebSocket(shellWsUrl);

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: DevPluginMessage = JSON.parse(event.data as string);

          if (msg.type === 'plugin-register') {
            activeDevPlugins.set(msg.slug, msg);
            window.dispatchEvent(new CustomEvent('plexica:plugin-register', { detail: msg }));
          } else if (msg.type === 'plugin-unregister') {
            activeDevPlugins.delete(msg.slug);
            window.dispatchEvent(new CustomEvent('plexica:plugin-unregister', { detail: msg }));
          }
        } catch {
          // Invalid message — ignore
        }
      };

      ws.onclose = () => {
        if (!stopped && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = getReconnectDelay();
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onopen = () => {
        reconnectAttempts = 0;
      };
    } catch {
      // WebSocket not available
    }
  }

  connect();
}

export function stopDevWatcher(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
  activeDevPlugins.clear();
}

export function getActiveDevPlugins(): DevPluginRegistration[] {
  return Array.from(activeDevPlugins.values());
}

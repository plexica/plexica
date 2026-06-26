// dev-server-registration.ts
// Vite plugin that registers the plugin dev server with the shell's WebSocket.
// Only active in development mode.

import { WebSocket } from 'ws';
import type { Plugin } from 'vite';

export interface DevServerRegistrationOptions {
  slug: string;
  remoteEntry: string;
  extensionPoints: string[];
  shellWsUrl: string;
}

export function devServerRegistration(options: DevServerRegistrationOptions): Plugin {
  let ws: WebSocket | null = null;

  return {
    name: '@plexica/dev-server-registration',

    configureServer(server) {
      function register(): void {
        try {
          ws = new WebSocket(options.shellWsUrl);

          ws.on('open', () => {
            const msg = JSON.stringify({
              type: 'plugin-register',
              slug: options.slug,
              remoteEntry: options.remoteEntry,
              extensionPoints: options.extensionPoints,
            });
            ws?.send(msg);
            server.config.logger.info(
              `[@plexica] Plugin "${options.slug}" registered with shell`
            );
          });

          ws.on('error', (err: Error) => {
            server.config.logger.warn(
              `[@plexica] Could not connect to shell WebSocket: ${err.message}`
            );
          });

          ws.on('close', () => {
            server.config.logger.info(
              `[@plexica] Disconnected for "${options.slug}"`
            );
          });
        } catch (err) {
          server.config.logger.warn(
            `[@plexica] Failed to create WebSocket: ${(err as Error).message}`
          );
        }
      }

      // Handle both already-listening and future-listening states
      if (server.httpServer?.listening) {
        register();
      } else {
        server.httpServer?.once('listening', register);
      }

      // Unregister on close
      server.httpServer?.once('close', () => {
        try {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'plugin-unregister', slug: options.slug }));
          }
          ws?.close();
        } catch {
          // Ignore cleanup errors
        }
      });
    },
  };
}

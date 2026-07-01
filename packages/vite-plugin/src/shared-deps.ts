// shared-deps.ts
// Shared Module Federation dependencies.
// These are the deps that the shell exposes and plugins consume.
// Pinned to exact version ranges to prevent runtime mismatch.

export const SHARED_DEPS = {
  react: {
    singleton: true,
    requiredVersion: '^19.0.0',
    eager: false,
  },
  'react-dom': {
    singleton: true,
    requiredVersion: '^19.0.0',
    eager: false,
  },
  '@tanstack/react-query': {
    singleton: true,
    requiredVersion: '^5.0.0',
    eager: false,
  },
  '@plexica/ui': {
    singleton: true,
    requiredVersion: '^0.1.0',
    eager: false,
  },
  '@plexica/i18n': {
    singleton: true,
    requiredVersion: '^0.1.0',
    eager: false,
  },
} as const;

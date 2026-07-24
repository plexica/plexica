// shared-deps.ts
// Shared Module Federation dependencies.
// These are the deps that the shell exposes and plugins consume.
// Pinned to exact version ranges to prevent runtime mismatch.

export const SHARED_DEPS = {
  react: {
    singleton: true,
    requiredVersion: '^19.0.0',
    eager: false,
    import: false,
    shareScope: 'default',
  },
  'react/jsx-runtime': {
    singleton: true,
    requiredVersion: '^19.0.0',
    eager: false,
    import: false,
    shareScope: 'default',
  },
  'react-dom': {
    singleton: true,
    requiredVersion: '^19.0.0',
    eager: false,
    import: false,
    shareScope: 'default',
  },
  '@tanstack/react-query': {
    singleton: true,
    requiredVersion: '^5.0.0',
    eager: false,
    import: false,
    shareScope: 'default',
  },
  '@plexica/ui': {
    singleton: true,
    requiredVersion: '^0.0.1',
    eager: false,
    import: false,
    shareScope: 'default',
  },
  'react-intl': {
    singleton: true,
    requiredVersion: '^6.6.0',
    eager: false,
    import: false,
    shareScope: 'default',
  },
} as const;

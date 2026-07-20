// tailwind.config.ts — Tailwind configuration for apps/admin
// Consumes the @plexica/ui design token preset (same as apps/web).

import uiPreset from '@plexica/ui/tailwind-preset';

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [uiPreset],
};

export default config;

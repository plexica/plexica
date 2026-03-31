// tailwind.config.ts — Tailwind configuration for @plexica/ui
// Used by Storybook (via postcss.config.js) to generate utility classes.
// Apps that consume this package use their own tailwind.config pointing
// to the shared preset (packages/ui/tailwind-preset.ts).

import preset from './tailwind-preset.js';

import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
};

export default config;

// .storybook/main.ts — Storybook configuration with Vite builder

import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes', '@storybook/addon-docs'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  }
};

export default config;

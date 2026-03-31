// postcss.config.js — PostCSS configuration for @plexica/ui
// Identical to apps/web setup. Required so Vite (used by Storybook via
// @storybook/react-vite) processes @tailwind directives in globals.css.

export default {
  plugins: {
    tailwindcss: {},
  },
};

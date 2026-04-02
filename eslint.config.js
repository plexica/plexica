// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist_keycloak/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Keycloakify auto-generated file — do not lint
      'packages/keycloak-theme/src/kc.gen.tsx',
      // Keycloakify dev-mode resources (vendor JS copied at build time)
      '**/public/keycloakify-dev-resources/**',
      // Stale Vite build output from old keycloak theme pipeline (superseded by JAR approach)
      'infra/keycloak/themes/**',
      // OpenCode agent configuration files — not project source, not linted
      '.opencode/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Disable base rule replaced by TypeScript-aware version
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // No console.log in production (use Pino logger)
      'no-console': 'error',
      // Import order enforcement
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
        },
      ],
    },
  },
  ...storybook.configs['flat/recommended'],
];

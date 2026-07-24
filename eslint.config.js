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
      '**/dist-ui/**',
      '**/dist_keycloak/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Keycloakify auto-generated file — do not lint
      'packages/keycloak-theme/src/kc.gen.tsx',
      // Keycloakify dev-mode resources (vendor JS copied at build time)
      '**/public/keycloakify-dev-resources/**',
      // Prisma-generated client (auto-generated JS/TS — not project source)
      '**/generated/**',
      // Stale Vite build output from old keycloak theme pipeline (superseded by JAR approach)
      'infra/keycloak/themes/**',
      // OpenCode agent configuration files — not project source, not linted
      '.opencode/**',
      // FORGE tooling templates and examples — installed by forge init, not project source
      '.forge/**',
    ],
  },
  // Node.js scripts (.mjs) — utility scripts not bundled into the app
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
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
  // Test files — allow non-null assertions (common in test assertions with mocks)
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];

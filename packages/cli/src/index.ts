#!/usr/bin/env node

// File: packages/cli/src/index.ts

import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { publishCommand } from './commands/publish.js';
import { initCommand } from './commands/init.js';

const program = new Command();

program.name('plexica').description('Plexica CLI for plugin development').version('0.1.0');

// Build command
program
  .command('build')
  .description('Build a plugin for production')
  .option('-c, --config <path>', 'Path to vite config file', 'vite.config.ts')
  .option('--no-minify', 'Disable minification')
  .option('--sourcemap', 'Generate source maps')
  .action(buildCommand);

// Publish command
program
  .command('publish')
  .description('Publish a plugin to the CDN')
  .option('-a, --api-url <url>', 'API server URL', 'http://localhost:3000')
  .option('-k, --api-key <key>', 'API authentication key')
  .option('-d, --dist <path>', 'Distribution directory', 'dist')
  .action(publishCommand);

// Init command (create new plugin from template)
program
  .command('init')
  .description('Create a new plugin from template')
  .argument('[name]', 'Plugin name')
  .option('-t, --template <type>', 'Template type (frontend, backend, fullstack)', 'frontend')
  .action(initCommand);

program.parse();

#!/usr/bin/env node
// CLI entry point for create-plexica-plugin.
/* global process, console */

import { run } from '../src/index.js';

const args = process.argv.slice(2);

// Parse --force and options
const options = {
  force: args.includes('--force'),
  name: args.find((a) => !a.startsWith('--')) ?? null,
};

run(options).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

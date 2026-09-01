#!/usr/bin/env node
// CLI entry point for create-plexica-plugin.
// CLI uses console.log intentionally — not subject to AGENTS.md production
// logging rule (mirrors src/index.ts).
/* global process */

import { run } from '../src/index.js';

const args = process.argv.slice(2);

// Parse --force and options
const options = {
  force: args.includes('--force'),
  name: args.find((a) => !a.startsWith('--')) ?? null,
};

run(options).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
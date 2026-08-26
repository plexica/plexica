#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [directory, ...registryFiles] = process.argv.slice(2);
const forbidden = /(?:authorization\s*[:=]\s*(?:bearer\s+)?(?!["']?\[REDACTED\]["']?)\S+|(?:password|secret|token|pepper|encryption[_-]?key|email|phone)\s*[:=]\s*(?!["']?\[REDACTED\]["']?)\S+)/i;
const registry = registryFiles.flatMap((file) => readFileSync(file, 'utf8').split('\n').flatMap((line) => {
  const split = line.indexOf('=');
  return split > 0 && /password|secret|token|pepper|encryption|access[_-]?key|user(?:name)?|database_url|postgres_host_url/i.test(line.slice(0, split))
    ? [line.slice(split + 1).replace(/^['"]|['"]$/g, '')] : [];
}));
for (const file of readdirSync(directory)) {
  const value = readFileSync(path.join(directory, file), 'utf8');
  if (forbidden.test(value) || registry.some((secret) => secret.length > 2 && value.includes(secret))) {
    throw new Error(`Unsanitized diagnostic data in ${file}`);
  }
}

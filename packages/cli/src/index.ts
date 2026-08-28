// index.ts — CLI project generator for Plexica plugins.
// CLI uses console.log intentionally — not subject to AGENTS.md production logging rule.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { TEMPLATES, render } from './templates.js';

interface Options { force: boolean; name: string | null }

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
// Display name injected into JSON ("name" field) and TS string literals.
// Restrict to letters, digits, spaces, hyphens, underscores — anything else
// (quotes, backticks, backslashes, braces, $) would break the generated file.
const NAME_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,254}$/u;

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .substring(0, 62)
    .replace(/-+$/, '');
}

export async function run(options: Options): Promise<void> {
  const name = options.name ?? 'my-plugin';
  const slug = toSlug(name);

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid plugin name "${name}". Use lowercase letters, numbers, and hyphens.`
    );
  }

  if (!NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid plugin name "${name}". Use letters, digits, spaces, hyphens, or underscores.`
    );
  }

  const targetDir = resolve(process.cwd(), slug);
  if (existsSync(targetDir) && !options.force) {
    throw new Error(
      `Directory "${slug}" already exists. Use --force to overwrite.`
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Creating plugin "${name}" (slug: ${slug})...`);

  for (const [filePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = join(targetDir, filePath);
    const dir = filePath.includes('/') ? join(targetDir, filePath.split('/').slice(0, -1).join('/')) : targetDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, render(content, slug, name));
  }

  // eslint-disable-next-line no-console
  console.log(`\n[OK] Plugin "${name}" created!\n`);
  // eslint-disable-next-line no-console
  console.log('Next steps:');
  // eslint-disable-next-line no-console
  console.log(`  cd ${slug}`);
  // eslint-disable-next-line no-console
  console.log('  pnpm install');
  // eslint-disable-next-line no-console
  console.log('  pnpm dev        # Dev mode (UI + backend + registration)');
  // eslint-disable-next-line no-console
  console.log('  pnpm build      # Production build');
}

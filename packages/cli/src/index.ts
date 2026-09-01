// index.ts — CLI project generator for Plexica plugins.
// CLI uses console.log intentionally — not subject to AGENTS.md production logging rule.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { TEMPLATES, render } from './templates.js';

interface Options {
  force: boolean;
  name: string | null;
}

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
// Display name injected into JSON ("name" field) and TS string literals.
// Restrict to letters, digits, spaces, hyphens, underscores — anything else
// (quotes, backticks, backslashes, braces, $) would break the generated file.
const NAME_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,254}$/u;
// toSlug() drops non-ASCII and keeps [a-z0-9-]. A name with no ASCII
// alphanumeric (e.g. "插件") produces an empty slug and fails the slug check
// with a confusing message — reject it up front with a clear error.
const HAS_ASCII_ALNUM = /[a-z0-9]/i;

/**
 * Convert a plugin display name to a valid slug identifier.
 * Lowercases, replaces non-alphanumeric chars with hyphens, and truncates to 62 chars.
 *
 * @param name - Plugin display name
 * @returns URL-safe slug identifier
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .substring(0, 62)
    .replace(/-+$/, '');
}

/**
 * Main entry point for the CLI. Generates a new Plexica plugin project scaffold.
 * Creates directory structure, package.json, tsconfig, Vite config, and starter files.
 *
 * @param options - CLI options including plugin name and force-overwrite flag
 * @throws {Error} if plugin name is invalid or target directory exists without --force
 */
export async function run(options: Options): Promise<void> {
  const name = options.name ?? 'my-plugin';
  const slug = toSlug(name);

  if (!NAME_REGEX.test(name) || !HAS_ASCII_ALNUM.test(name)) {
    throw new Error(
      `Invalid plugin name "${name}". Use letters, digits, spaces, hyphens, or underscores — and at least one ASCII letter or digit (the name becomes the project slug).`
    );
  }

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`Invalid plugin name "${name}". Use lowercase letters, numbers, and hyphens.`);
  }

  const targetDir = resolve(process.cwd(), slug);
  if (existsSync(targetDir) && !options.force) {
    throw new Error(`Directory "${slug}" already exists. Use --force to overwrite.`);
  }

  // eslint-disable-next-line no-console
  console.log(`Creating plugin "${name}" (slug: ${slug})...`);

  for (const [filePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = join(targetDir, filePath);
    const dir = filePath.includes('/')
      ? join(targetDir, filePath.split('/').slice(0, -1).join('/'))
      : targetDir;
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

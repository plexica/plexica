// index.ts — CLI project generator for Plexica plugins.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TEMPLATES, render } from './templates.js';

interface Options { force: boolean; name: string | null }

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 62);
}

export async function run(options: Options): Promise<void> {
  const name = options.name ?? 'my-plugin';
  const slug = toSlug(name);

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid plugin name "${name}". Use lowercase letters, numbers, and hyphens.`
    );
  }

  const targetDir = resolve(process.cwd(), slug);
  if (existsSync(targetDir) && !options.force) {
    throw new Error(
      `Directory "${slug}" already exists. Use --force to overwrite.`
    );
  }

  console.log(`Creating plugin "${name}" (slug: ${slug})...`);

  for (const [filePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = join(targetDir, filePath);
    const dir = filePath.includes('/') ? join(targetDir, filePath.split('/').slice(0, -1).join('/')) : targetDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, render(content, slug, name));
  }

  console.log(`\n✅ Plugin "${name}" created!\n`);
  console.log('Next steps:');
  console.log(`  cd ${slug}`);
  console.log('  pnpm install');
  console.log('  pnpm dev        # Dev mode (UI + backend + registration)');
  console.log('  pnpm build      # Production build');
}

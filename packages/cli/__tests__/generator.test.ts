// CLI generator tests

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run, toSlug } from '../src/index.js';
import { render } from '../src/templates.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plexica-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('CLI template rendering', () => {
  it('replaces {{slug}} in manifest', () => {
    const template = '{"slug": "{{slug}}"}';
    expect(render(template, 'my-plugin', 'My Plugin')).toBe('{"slug": "my-plugin"}');
  });

  it('replaces {{name}} in manifest', () => {
    const template = '{"name": "{{name}}"}';
    expect(render(template, 'my-plugin', 'My Plugin')).toBe('{"name": "My Plugin"}');
  });

  it('replaces both slug and name', () => {
    const template = '{"slug": "{{slug}}", "name": "{{name}}"}';
    const result = render(template, 'my-crm', 'My CRM');
    expect(result).toContain('"slug": "my-crm"');
    expect(result).toContain('"name": "My CRM"');
  });

  it('handles package.json template', () => {
    const tmpl = `"name": "{{slug}}"`;
    expect(render(tmpl, 'test-plugin', 'TP')).toBe('"name": "test-plugin"');
  });

  it('handles dev-entry.ts template', () => {
    const tmpl = "slug: '{{slug}}'";
    expect(render(tmpl, 'my-plugin', 'My Plugin')).toBe("slug: 'my-plugin'");
  });
});

describe('Slug generation', () => {
  it('converts name to lowercase kebab', () => {
    expect(toSlug('My CRM Plugin')).toBe('my-crm-plugin');
  });

  it('removes leading/trailing hyphens', () => {
    expect(toSlug('-test-')).toBe('test');
  });

  it('truncates to 62 chars', () => {
    expect(toSlug('a'.repeat(100)).length).toBe(62);
  });

  it('collapses runs of invalid characters into a single hyphen', () => {
    expect(toSlug('My  CRM')).toBe('my-crm');
  });

  it('strips trailing hyphens left by truncation', () => {
    const slug = toSlug(`${'a'.repeat(61)}-b`);
    expect(slug).toBe('a'.repeat(61));
  });

  it('rejects a name with no ASCII alphanumeric (empty slug)', async () => {
    await expect(run({ force: false, name: '插件' })).rejects.toThrow(
      /at least one ASCII letter or digit/
    );
  });

  it('accepts a mixed ASCII/Unicode name that yields a valid slug', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'Café CRM' });
    expect(existsSync(join(dir, 'caf-crm', 'manifest.json'))).toBe(true);
  });
});
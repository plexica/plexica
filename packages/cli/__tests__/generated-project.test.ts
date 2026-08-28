// CLI generator tests

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { run } from '../src/index.js';
import { TEMPLATES } from '../src/templates.js';

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

describe('Generated project (smoke)', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('creates a standalone project tree in a new directory', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const project = join(dir, 'my-plugin');

    // Every template file must be written.
    for (const file of Object.keys(TEMPLATES)) {
      expect(existsSync(join(project, file))).toBe(true);
    }
  });

  it('renders the manifest with correct slug and coherent port', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'acme-crm' });
    const manifest = JSON.parse(readFileSync(join(dir, 'acme-crm', 'manifest.json'), 'utf8'));

    expect(manifest.slug).toBe('acme-crm');
    expect(manifest.hosting.port).toBe(3000);
    expect(manifest.ui.remoteEntry).toBe('remoteEntry.js');
    expect(manifest.ui.extensionPoints).toContain('sidebar:admin');
    // F1: manifest must pass platform Zod validation (author/icon min 1 char).
    expect(manifest.author.length).toBeGreaterThan(0);
    expect(manifest.icon.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it('generates the MF entry file the vite preset resolves for sidebar:admin', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const uiEntry = join(dir, 'my-plugin', 'ui', 'sidebar-admin.tsx');
    expect(existsSync(uiEntry)).toBe(true);
  });

  it('does not generate dead or duplicate template files', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const project = join(dir, 'my-plugin');

    // G13: dev-register.ts was dead code — must not be generated.
    expect(existsSync(join(project, 'dev-register.ts'))).toBe(false);
    // G7: health routes live in src/index.ts only — no separate health.ts.
    expect(existsSync(join(project, 'src', 'health.ts'))).toBe(false);
    // G10: @plexica/vite-plugin must not be duplicated across dep sections.
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@plexica/vite-plugin']).toBeUndefined();
    expect(pkg.devDependencies['@plexica/vite-plugin']).toBeDefined();
  });

  it('declares React and shared MF deps in the generated package.json', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const pkg = JSON.parse(readFileSync(join(dir, 'my-plugin', 'package.json'), 'utf8'));

    for (const dep of ['react', 'react-dom', '@tanstack/react-query', 'react-intl', '@plexica/ui']) {
      expect(pkg.dependencies[dep]).toBeDefined();
    }
    for (const dep of ['@originjs/vite-plugin-federation', '@vitejs/plugin-react', 'concurrently']) {
      expect(pkg.devDependencies[dep]).toBeDefined();
    }
  });

  it('generates a vite config with a resolvable MF entry', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const viteConfig = readFileSync(join(dir, 'my-plugin', 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("rollupOptions: { input: 'ui/index.ts' }");
    expect(viteConfig).toContain("outDir: 'dist-ui'");
    expect(viteConfig).toContain('@vitejs/plugin-react');
    expect(viteConfig).toContain('manifestPath');
  });

  it('wires dev-entry to SDK dev helpers instead of raw fetch', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const devEntry = readFileSync(join(dir, 'my-plugin', 'dev-entry.ts'), 'utf8');

    expect(devEntry).toContain("from '@plexica/sdk/dev'");
    expect(devEntry).toContain('registerBackend');
    expect(devEntry).toContain('unregisterBackend');
    // G11: dev backend URL must match manifest hosting.port (3000).
    expect(devEntry).toContain('http://localhost:3000');
    // F2: dev registration requires the tenant slug (X-Tenant-Slug header).
    expect(devEntry).toContain('tenantSlug');
    expect(devEntry).toContain('TENANT_SLUG');
  });

  it('does not ship deprecated KAFKA_BROKERS in the env template', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const env = readFileSync(join(dir, 'my-plugin', '.env.development'), 'utf8');

    expect(env).not.toContain('KAFKA_BROKERS');
  });

  it('keeps Dockerfile buildable without a pre-existing lockfile', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const dockerfile = readFileSync(join(dir, 'my-plugin', 'Dockerfile'), 'utf8');

    expect(dockerfile).not.toContain('pnpm-lock.yaml');
    expect(dockerfile).toContain('pnpm install');
  });

  it('ships a .dockerignore so host artifacts do not leak into the image', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const dockerignore = readFileSync(join(dir, 'my-plugin', '.dockerignore'), 'utf8');

    for (const entry of ['node_modules', 'dist', 'dist-ui', '.env', '.git']) {
      expect(dockerignore).toContain(entry);
    }
  });

  it('writes a .gitignore so the new repo does not commit artifacts', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const gitignore = readFileSync(join(dir, 'my-plugin', '.gitignore'), 'utf8');

    for (const entry of ['node_modules', 'dist', 'dist-ui', '.env']) {
      expect(gitignore).toContain(entry);
    }
  });

  it('writes an .npmrc pointing @plexica/* at GitHub Packages (ADR-033)', async () => {
    const dir = makeTempDir();
    process.chdir(dir);
    await run({ force: false, name: 'my-plugin' });
    const npmrc = readFileSync(join(dir, 'my-plugin', '.npmrc'), 'utf8');

    expect(npmrc).toContain('@plexica:registry=https://npm.pkg.github.com/');
    // H3: never ship an ACTIVE token line or env placeholder in the project
    // .npmrc — pnpm >=10.34.2 ignores ${VAR} there; the token belongs in
    // user-level config. Comment lines documenting the setup are fine.
    const activeLines = npmrc
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
    for (const line of activeLines) {
      expect(line).not.toContain('_authToken');
      expect(line).not.toContain('${');
    }
  });
});

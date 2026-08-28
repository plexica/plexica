// Test for the PUBLISHED CLI artifact: dist/bin/create-plexica-plugin.js.
// The other smoke tests import run() from src; this one exercises the built
// bin so a broken path/shebang/exec-bit cannot ship to GitHub Packages (M5).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plexica-cli-bin-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Published CLI bin', () => {
  it('builds and executes the published bin', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const builtBin = resolve(
      repoRoot,
      'packages',
      'cli',
      'dist',
      'bin',
      'create-plexica-plugin.js'
    );
    expect(existsSync(builtBin)).toBe(true);

    const dir = makeTempDir();
    const out = execFileSync(process.execPath, [builtBin, 'bin-smoke'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(out).toContain('Plugin "bin-smoke" created');
    expect(existsSync(join(dir, 'bin-smoke', 'manifest.json'))).toBe(true);
  });
});
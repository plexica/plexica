#!/usr/bin/env node
/**
 * Merge Cobertura coverage reports from all workspaces into a single
 * report at coverage/cobertura-coverage.xml (repo-root relative paths).
 *
 * ADR-030: each workspace generates coverage/unit/cobertura-coverage.xml
 * (core-api via vitest.config.ts; the packages via CLI flags in their
 * test:unit:coverage script). This script concatenates the <package>
 * elements, rewrites each <class> filename to be repo-root relative, and
 * recomputes the root <coverage> attributes so the merged report is valid
 * for GitHub Native Code Coverage (actions/upload-code-coverage).
 *
 * Usage: node scripts/merge-coverage.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIRS = ['services', 'packages'];
const OUTPUT = 'coverage/cobertura-coverage.xml';
const REPO_ROOT = process.cwd();

// Collect every workspace's coverage report (Node 20 compatible; no globSync).
const files = [];
for (const dir of WORKSPACE_DIRS) {
  for (const entry of existsSync(join(REPO_ROOT, dir)) ? readdirSync(join(REPO_ROOT, dir)) : []) {
    const rel = join(dir, entry, 'coverage', 'unit', 'cobertura-coverage.xml');
    if (existsSync(join(REPO_ROOT, rel))) files.push(rel);
  }
}
files.sort();

if (files.length === 0) {
  console.error('No coverage reports found under services/* and packages/*/coverage/unit/');
  process.exit(1);
}

// Aggregate stats, computed from the <package> blocks actually kept (the
// per-report <coverage> root attributes include test-file lines that we drop).
const stats = {
  'lines-valid': 0,
  'lines-covered': 0,
  'branches-valid': 0,
  'branches-covered': 0,
};
const packages = [];

for (const rel of files) {
  const xml = readFileSync(join(REPO_ROOT, rel), 'utf8');
  const match = xml.match(/<coverage\b[^>]*>/);
  if (!match) {
    console.error('Malformed coverage report:', rel);
    process.exit(1);
  }

  // Collect <package> blocks. The <sources><source> is the workspace
  // absolute path; filenames inside are workspace-relative.
  const sourceM = xml.match(/<sources>\s*<source>([^<]+)<\/source>/);
  const workspacePrefix = sourceM ? sourceM[1].replace(/\/+$/, '') : '';

  const pkgRegex = /<package\b[^>]*>[\s\S]*?<\/package>/g;
  for (const pkgBlock of pkgRegex.exec(xml) ? xml.match(pkgRegex) : []) {
    // Drop test files from the aggregate: they live in __tests__ or are
    // *.test.ts, and core-api already excludes them from its report. Test
    // helpers (e.g. packages/auth/__tests__/test-helpers.ts) leak in when a
    // workspace has no explicit coverage.exclude — filter them here so the
    // merged numbers measure source only.
    if (pkgBlock.includes('__tests__/') || /\.test\.ts"/.test(pkgBlock)) {
      continue;
    }

    // Tally this package's kept lines/branches from the <line> elements:
    // each <line number hits> is one line (covered iff hits > 0); each
    // <line branch="true"> is one branch (covered iff hits > 0).
    const lineEls = pkgBlock.matchAll(/<line\b[^>]*>/g);
    for (const le of lineEls) {
      const isBranch = /branch="true"/.test(le[0]);
      const hits = Number(le[0].match(/hits="(\d+)"/)?.[1] ?? 0);
      if (isBranch) {
        stats['branches-valid'] += 1;
        if (hits > 0) stats['branches-covered'] += 1;
      } else {
        stats['lines-valid'] += 1;
        if (hits > 0) stats['lines-covered'] += 1;
      }
    }

    let rewritten = pkgBlock;
    if (workspacePrefix) {
      // filename="src/foo.ts" → filename="{workspace-relative}/src/foo.ts".
      // GitHub Native Code Coverage resolves paths against the repo root, so
      // emit repo-relative paths ("packages/sdk/src/foo.ts"), never absolutes.
      const repoRelPrefix = workspacePrefix.replace(
        new RegExp(`^${REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`),
        ''
      );
      rewritten = rewritten.replace(
        /(filename=")([^"]+)(")/g,
        (_, open, name, close) => {
          if (name.startsWith('/')) return open + name + close;
          return open + `${repoRelPrefix}/${name}` + close;
        }
      );
    }
    packages.push(rewritten);
  }
}

const linesValid = stats['lines-valid'];
const linesCovered = stats['lines-covered'];
const branchesValid = stats['branches-valid'];
const branchesCovered = stats['branches-covered'];

const lineRate = linesValid > 0 ? (linesCovered / linesValid).toFixed(4) : '0';
const branchRate = branchesValid > 0 ? (branchesCovered / branchesValid).toFixed(4) : '0';

const out = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage lines-valid="${linesValid}" lines-covered="${linesCovered}" line-rate="${lineRate}" branches-valid="${branchesValid}" branches-covered="${branchesCovered}" branch-rate="${branchRate}" complexity="0" version="0.1" timestamp="${Date.now()}">
<sources>
<source>${REPO_ROOT}</source>
</sources>
<packages>
${packages.join('\n')}
</packages>
</coverage>
`;

mkdirSync(join(REPO_ROOT, 'coverage'), { recursive: true });
writeFileSync(join(REPO_ROOT, OUTPUT), out);
console.log(
  `Merged ${files.length} reports: ${linesCovered}/${linesValid} lines (` +
    `${(100 * lineRate).toFixed(1)}%), ${branchesCovered}/${branchesValid} branches ` +
    `→ ${OUTPUT}`
);

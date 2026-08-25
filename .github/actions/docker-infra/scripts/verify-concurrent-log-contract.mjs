// Command-log contract checks for verify-concurrent-ci-runtime.test.sh.
// Each mode asserts one documented property of the serialized COMMAND_LOG
// produced by the mocked lifecycle helpers. Usage:
//   node verify-concurrent-log-contract.mjs <mode> <command-log>
import { readFileSync } from 'node:fs';

const [mode, logPath] = process.argv.slice(2);
const lines = readFileSync(logPath, 'utf8').trim().split('\n');
const fail = () => process.exit(1);
const findIndex = (re) => {
  const index = lines.findIndex((line) => re.test(line));
  return index;
};
const count = (re) => lines.filter((line) => re.test(line)).length;
const PROJECTS = ['plexica-ci-a-', 'plexica-ci-b-'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const playwrightRe = (filter, spec) =>
  new RegExp(
    `^pnpm --filter ${escapeRe(filter)} exec playwright test --output (.+)/playwright/([a-z]+)/test-results` +
      (spec ? ` ${escapeRe(spec)}$` : '$')
  );

switch (mode) {
  case 'teardown-once':
    for (const project of PROJECTS) {
      if (count(new RegExp(`^down-ci-runtime-project\\.sh ${project}`)) !== 1) fail();
    }
    break;
  case 'bootstrap-order':
    for (const project of PROJECTS) {
      const order = [
        findIndex(new RegExp(`^start-services\\.sh ${project}`)),
        findIndex(new RegExp(`^wait-services\\.sh ${project}`)),
        findIndex(new RegExp(`^run-e2e-global-setup\\.sh web ${project}`)),
        findIndex(new RegExp(`^run-e2e-global-setup\\.sh admin ${project}`)),
        lines.findIndex((line) => line.includes('/playwright/') && line.includes(project)),
      ];
      if (order.includes(-1) || !order.every((v, i) => i === 0 || v > order[i - 1])) fail();
    }
    break;
  case 'canonical-seeding': {
    const downA = findIndex(/down-ci-runtime-project\.sh plexica-ci-a-/);
    if (downA < 0) fail();
    for (const project of PROJECTS) {
      for (const app of ['web', 'admin']) {
        const re = new RegExp(`^run-e2e-global-setup\\.sh ${app} ${project}`);
        if (lines.slice(0, downA + 1).filter((line) => re.test(line)).length !== 1) fail();
        const filter = app === 'web' ? 'web' : '@plexica/admin';
        if (
          !lines
            .slice(0, downA + 1)
            .some((line) => line.startsWith(`pnpm --filter ${filter} exec playwright test`) && line.includes(project))
        )
          fail();
      }
    }
    break;
  }
  case 'outputs-and-skips': {
    const downA = findIndex(/down-ci-runtime-project\.sh plexica-ci-a-/);
    if (downA < 0) fail();
    const preLines = lines.slice(0, downA + 1);
    const postLines = lines.slice(downA + 1);
    // Every Playwright invocation must target a per-project output root and
    // be immediately followed by the matching per-project HTML report line.
    for (let i = 0; i < lines.length; i++) {
      if (!/^pnpm --filter \S+ exec playwright test/.test(lines[i])) continue;
      const match = lines[i].match(/--output (.+)\/playwright\/([a-z]+)\/test-results/);
      if (!match || lines[i + 1] !== `html-report ${match[1]}/playwright/${match[2]}/report`) fail();
    }
    // Contract specs execute exactly once per project pre-teardown and exactly
    // once for surviving project B post-teardown; full suites must exist.
    const spec = 'e2e/ci-runtime-contract.spec.ts';
    for (const filter of ['web', '@plexica/admin']) {
      if (preLines.filter((line) => playwrightRe(filter, spec).test(line)).length !== 2) fail();
      if (postLines.filter((line) => playwrightRe(filter, spec).test(line)).length !== 1) fail();
      if (!preLines.some((line) => playwrightRe(filter).test(line))) fail();
    }
    // Dedupe proof: full-suite invocations carry the contract-skip marker;
    // explicit single-spec invocations never do.
    for (let i = 0; i < lines.length; i++) {
      if (!/^pnpm --filter \S+ exec playwright test/.test(lines[i])) continue;
      const isSpec = / e2e\/ci-runtime-contract\.spec\.ts$/.test(lines[i]);
      if (isSpec === (lines[i - 1] === 'contract-skip')) fail();
    }
    if (lines.some((line) => /(?<!e2e\/)ci-runtime-contract\.spec\.ts$/.test(line))) fail();
    break;
  }
  case 'failure-flow': {
    const collect = findIndex(/collect-ci-runtime-diagnostics\.sh plexica-ci-a-/);
    const downA = findIndex(/down-ci-runtime-project\.sh plexica-ci-a-/);
    const downB = findIndex(/down-ci-runtime-project\.sh plexica-ci-b-/);
    if (collect < 0 || downA < 0 || downB < 0 || collect > downA || collect > downB) fail();
    if (lines.some((line) => /plexica-ci-(?!a-|b-)/.test(line))) fail();
    break;
  }
  case 'init-failure':
    if (!lines.some((line) => /collect-ci-runtime-diagnostics\.sh plexica-ci-a-/.test(line))) fail();
    if (!lines.some((line) => /down-ci-runtime-project\.sh plexica-ci-a-/.test(line))) fail();
    if (lines.some((line) => /plexica-ci-b-/.test(line))) fail();
    break;
  case 'signal-once': {
    for (const name of ['down-ci-runtime-project.sh', 'collect-ci-runtime-diagnostics.sh']) {
      if (count(new RegExp(`^${name} plexica-signal-a$`)) !== 1) fail();
    }
    break;
  }
  default:
    console.error(`Unknown mode: ${mode}`);
    fail();
}

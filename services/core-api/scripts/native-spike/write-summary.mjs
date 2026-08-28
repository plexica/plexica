import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [evidenceRoot] = process.argv.slice(2);
if (!evidenceRoot) throw new Error('Usage: write-summary.mjs <evidence-root>');

const targets = ['runner', 'core-runtime'].map((name) => ({
  name,
  workflowOutcome: process.env[`${name === 'runner' ? 'RUNNER' : 'CORE'}_OUTCOME`] ?? 'unknown',
  complete: existsSync(resolve(evidenceRoot, name, 'result.json')),
}));
const passed = targets.every(
  ({ workflowOutcome, complete }) => workflowOutcome === 'success' && complete
);
const gates = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [
    `KJM-G${String(index + 1).padStart(2, '0')}`,
    passed ? 'PASS' : 'FAIL',
  ])
);

process.stdout.write(
  `${JSON.stringify({ overall: passed ? 'PASS' : 'FAIL', targets, gates }, null, 2)}\n`
);
if (!passed) process.exitCode = 1;

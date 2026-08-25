// Command-log ordering contract: every argument pattern must match exactly
// one line (first match wins) and matches must appear in strict ascending
// order. Used by the CI runtime lifecycle tests to prove that staging steps
// (create -> populate -> start -> resolve port) never invert.
import { readFileSync } from 'node:fs';

const [log, ...patterns] = process.argv.slice(2);
if (!log || patterns.length === 0) {
  console.error('Usage: node ci-command-order.mjs <command-log> <suffix-pattern>...');
  process.exit(1);
}
const lines = readFileSync(log, 'utf8').trim().split('\n');
const indexOf = (pattern) => {
  for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) return i;
  return -1;
};
const order = patterns.map(indexOf);
if (order.includes(-1) || !order.every((value, index) => index === 0 || value > order[index - 1])) {
  process.exit(1);
}

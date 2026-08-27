import { readFileSync } from 'node:fs';

const [logPath] = process.argv.slice(2);
if (!logPath) throw new Error('Usage: verify-install-log.mjs <install-log>');

const log = readFileSync(logPath, 'utf8');
const assetName = `confluent-kafka-javascript-v1.10.0-node-v${process.versions.modules}-linux-glibc-${process.arch}.tar.gz`;
const forbidden = [
  ['node-gyp execution', /(?:^|\s)node-gyp(?:\s|$)/im],
  ['gyp execution', /^gyp (?:info|verb|warn|error)/im],
  ['make execution', /make(?:\[\d+\])?: Entering directory/im],
  ['compiler target', /\b(?:CC|CXX)\(target\)/],
  ['source build flag', /--build-from-source/],
  ['source fallback', /fall(?:ing)? back to (?:build|source)/i],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  log.includes(
    `GET https://github.com/confluentinc/confluent-kafka-javascript/releases/download/v1.10.0/${assetName}`
  ),
  'KJM-G03: expected prebuilt download is absent'
);
assert(log.includes('is installed via remote'), 'KJM-G03: remote prebuilt success is absent');

const violations = forbidden.filter(([, pattern]) => pattern.test(log)).map(([name]) => name);
assert(violations.length === 0, `KJM-G03/G09: forbidden build activity: ${violations.join(', ')}`);

process.stdout.write(
  `${JSON.stringify({ assetName, remotePrebuilt: true, sourceBuildExecution: false, violations }, null, 2)}\n`
);

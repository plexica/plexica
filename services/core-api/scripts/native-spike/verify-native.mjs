import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const entryPath = require.resolve('@confluentinc/kafka-javascript');
const packageRoot = resolve(dirname(entryPath), '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const addonPath = realpathSync(
  resolve(packageRoot, 'build/Release/confluent-kafka-javascript.node')
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inspect(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

assert(process.version.startsWith('v24.'), 'KJM-G01: Node 24 is required');
assert(process.platform === 'linux', 'KJM-G10: Linux is required');
assert(!process.env.LD_LIBRARY_PATH, 'KJM-G05: LD_LIBRARY_PATH workaround is prohibited');
assert(packageJson.version === '1.10.0', 'KJM-G02: package version mismatch');

const kafka = require('@confluentinc/kafka-javascript');
const report = process.report.getReport();
const loadedAddons = report.sharedObjects
  .filter((path) => path.endsWith('.node'))
  .map((path) => realpathSync(path));
const fileOutput = inspect('file', [addonPath]);
const elfHeader = inspect('readelf', ['--file-header', addonPath]);
const elfVersions = inspect('readelf', ['--version-info', addonPath]);
const lddOutput = inspect('ldd', [addonPath]);
const expectedMachine = process.arch === 'x64' ? /X86-64/ : /AArch64/;

assert(['x64', 'arm64'].includes(process.arch), 'KJM-G10: unsupported architecture');
assert(report.header.glibcVersionRuntime, 'KJM-G06: glibc runtime was not detected');
assert(kafka.librdkafkaVersion === '2.15.0', 'KJM-G05: librdkafka version mismatch');
assert(kafka.KafkaJS?.Kafka, 'KJM-G05: compatibility API is unavailable');
assert(kafka.RdKafka, 'KJM-G05: callback API surface is unavailable');
assert(loadedAddons.includes(addonPath), 'KJM-G05: expected native addon was not loaded');
assert(
  loadedAddons.filter((path) => path === addonPath).length === 1,
  'KJM-G05: addon load count mismatch'
);
assert(expectedMachine.test(elfHeader), 'KJM-G06: ELF architecture mismatch');
assert(/GLIBC_/.test(elfVersions), 'KJM-G06: ELF glibc requirements are missing');
assert(!/not found/i.test(lddOutput), 'KJM-G06: unresolved shared library');

const evidence = {
  packageVersion: packageJson.version,
  librdkafkaVersion: kafka.librdkafkaVersion,
  addonPath,
  apiSurfaces: { compatibility: true, callback: true, sharedAddon: true },
  runtime: {
    node: process.version,
    abi: process.versions.modules,
    platform: process.platform,
    arch: process.arch,
    glibcRuntime: report.header.glibcVersionRuntime,
  },
  fileOutput,
  elfHeader,
  elfVersions,
  lddOutput,
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

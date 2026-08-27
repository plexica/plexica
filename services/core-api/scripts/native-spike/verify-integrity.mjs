import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { AbortSignal, fetch } = globalThis;
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lockfile = readFileSync(resolve(workspaceRoot, 'pnpm-lock.yaml'), 'utf8');
const packageName = '@confluentinc/kafka-javascript';
const packageVersion = '1.10.0';
const assetName = `confluent-kafka-javascript-v${packageVersion}-node-v${process.versions.modules}-linux-glibc-${process.arch}.tar.gz`;
const expectedAbi137 = {
  x64: 'ccc2a8b2fcf89e01c7dd6895ddfc2ad5599aff32bf090d6b9e02854f64e66358',
  arm64: '5f057e2c67eaed9ba31260e5a449d86dadb6fa5823e5d1fc7df2ebed1628efd8',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Request failed with HTTP ${response.status}`);
  return response.json();
}

const release = await getJson(
  'https://api.github.com/repos/confluentinc/confluent-kafka-javascript/releases/tags/v1.10.0'
);
const asset = release.assets.find(({ name }) => name === assetName);
assert(asset, `KJM-G04: release asset is missing: ${assetName}`);
assert(asset.digest?.startsWith('sha256:'), 'KJM-G04: release API digest is missing');

const assetResponse = await fetch(asset.browser_download_url, {
  redirect: 'follow',
  signal: AbortSignal.timeout(60_000),
});
assert(assetResponse.ok, `Asset download failed with HTTP ${assetResponse.status}`);
const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
const localDigest = createHash('sha256').update(assetBytes).digest('hex');
const publishedDigest = asset.digest.slice('sha256:'.length);
assert(localDigest === publishedDigest, 'KJM-G04: release asset checksum mismatch');

if (process.versions.modules === '137') {
  assert(localDigest === expectedAbi137[process.arch], 'KJM-G04: ABI 137 expected digest mismatch');
}

const escapedName = packageName.replace('/', '\\/');
const lockMatch = lockfile.match(
  new RegExp(`'${escapedName}@${packageVersion}':\\n    resolution: \\{integrity: ([^}]+)\\}`)
);
assert(lockMatch, 'KJM-G02: package integrity is missing from the frozen lock');

const registry = await getJson(
  `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${packageVersion}`
);
assert(registry.version === packageVersion, 'KJM-G02: npm package version mismatch');
assert(lockMatch[1] === registry.dist.integrity, 'KJM-G02: lock and npm integrity mismatch');

const evidence = {
  package: { name: packageName, version: registry.version },
  npmTarball: { url: registry.dist.tarball, integrity: registry.dist.integrity },
  frozenLockIntegrity: lockMatch[1],
  releaseAsset: {
    apiUrl: asset.url,
    downloadUrl: asset.browser_download_url,
    name: asset.name,
    size: asset.size,
    publishedDigest: asset.digest,
    localSha256: localDigest,
    downloadedSize: assetBytes.length,
  },
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

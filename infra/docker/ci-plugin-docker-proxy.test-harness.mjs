import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

export const project = 'plexica-ci-proxy-123456789012345678901234567';
export const installId = '123e4567-e89b-42d3-a456-426614174000';
// Exact shape emitted by publish-sidecar-images.sh: [loopback-host:port/]name@sha256:<64hex>.
export const pinnedImage =
  '127.0.0.1:32791/plugin-sidecar@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584';
export const harnessImage =
  '127.0.0.1:32791/sidecar-harness@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const scope = `ci-${createHash('sha256').update(project).digest('hex').slice(0, 28)}`;
export const name = `plexica-plugin-${scope}-${createHash('sha256').update(installId).digest('hex').slice(0, 16)}`;
export const temp = await mkdtemp(join(tmpdir(), 'plexica-docker-proxy-'));
export const socket = join(temp, 'docker.sock');
export const forwarded = [];

const daemon = createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  forwarded.push({ url: incoming.url, body: Buffer.concat(chunks).toString() });
  if (incoming.url?.includes('/json')) {
    const malformed = incoming.url.includes('malformed');
    const foreign = incoming.url.includes('foreign');
     outgoing.end(
       JSON.stringify({
         Name: `/${name}`,
          Config: {
            // The real daemon serialises label maps with sorted keys on
            // inspect; mirror that so ownership checks cannot rely on
            // client-side insertion order.
            Labels: Object.fromEntries(
              Object.entries({
                'io.plexica.installation': installId,
                'io.plexica.runtime-scope': foreign ? 'foreign' : scope,
                'io.plexica.runtime-project': project,
                'com.docker.compose.project': project,
              }).sort(([a], [b]) => a.localeCompare(b))
            ),
           Env: malformed ? ['CORE_API_URL=http://host.docker.internal:3001'] : [],
         },
         HostConfig: { Binds: ['/run/plexica-ci-plexica-ci-proxy-123456789012345678901234567/postgres-ca.crt:/tmp/plexica-postgres-ca.crt:ro'], PortBindings: malformed ? { '3000/tcp': [{ HostPort: '32000' }] } : {} },
        NetworkSettings: {
          Ports: { '3000/tcp': malformed ? [{ HostPort: '32000' }] : null },
          Networks: { [`${project}_default`]: { Aliases: [name] } },
        },
      })
    );
  } else {
    outgoing.writeHead(201).end('{}');
  }
});
await new Promise((resolve) => daemon.listen(socket, resolve));

const proxyPath = fileURLToPath(new URL('./ci-plugin-docker-proxy.mjs', import.meta.url));
for (const [label, env] of [
  ['a missing', {}],
  ['an unpinned', { PLUGIN_SIDECAR_IMAGE: 'node:24-bookworm' }],
  ['a digest-less', { PLUGIN_SIDECAR_IMAGE: 'node:24-bookworm:1.0.0' }],
  ['an invalid', { PLUGIN_SIDECAR_IMAGE: `${pinnedImage}extra` }],
  ['a tag-only loopback registry reference', { PLUGIN_SIDECAR_IMAGE: '127.0.0.1:32791/sidecar-harness' }],
  ['an empty loopback registry port', { PLUGIN_SIDECAR_IMAGE: `127.0.0.1:/sidecar-harness@sha256:${'a'.repeat(64)}` }],
  ['a truncated loopback registry digest', { PLUGIN_SIDECAR_IMAGE: `127.0.0.1:32791/sidecar-harness@sha256:${'a'.repeat(63)}` }],
  ['a missing harness', { PLUGIN_SIDECAR_IMAGE: pinnedImage }],
  ['an unpinned harness', { PLUGIN_SIDECAR_IMAGE: pinnedImage, CI_SIDECAR_HARNESS_IMAGE: 'node:22-bookworm' }],
]) {
  const failingEnv = { ...process.env, CI_RUNTIME_PROJECT: project, PLUGIN_DOCKER_SOCKET: socket, ...env };
  delete failingEnv.CI_SIDECAR_HARNESS_IMAGE;
  Object.assign(failingEnv, env);
  const failing = spawn(process.execPath, [proxyPath], { env: failingEnv });
  const code = await new Promise((resolve) => failing.on('exit', resolve));
  if (code === 0)
    throw new Error(`Proxy started with ${label} image configuration instead of failing closed`);
}

export const proxy = spawn(process.execPath, [proxyPath], {
  env: {
    ...process.env,
    CI_RUNTIME_PROJECT: project,
    PLUGIN_DOCKER_SOCKET: socket,
    PLUGIN_SIDECAR_IMAGE: pinnedImage,
    CI_SIDECAR_HARNESS_IMAGE: harnessImage,
  },
});

export const daemonRef = daemon;

export function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const client = request({ host: '127.0.0.1', port: 2375, method, path }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    client.on('error', reject);
    client.end(body);
  });
}

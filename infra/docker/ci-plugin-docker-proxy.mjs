import { createServer, request as dockerRequest } from 'node:http';
import { URL } from 'node:url';

import {
  caBind,
  createPayload,
  exactLabels,
  identity,
  project,
  trustedImages,
  unsafeContainerAccess,
  uuid,
} from './ci-plugin-docker-rules.mjs';

const socketPath = process.env.PLUGIN_DOCKER_SOCKET ?? '/var/run/docker.sock';

function pathOf(url) { return new URL(url, 'http://docker').pathname.replace(/^\/v[\d.]+/, ''); }
async function assertOwned(reference) {
  const result = await daemon('GET', `/containers/${encodeURIComponent(reference)}/json`);
  if (result.status !== 200) throw new Error('Unknown plugin container');
  const inspected = JSON.parse(result.body);
  const labels = inspected.Config?.Labels ?? {};
  const installId = labels['io.plexica.installation'];
  if (
    !uuid.test(installId ?? '') ||
    !exactLabels(labels, installId) ||
    inspected.Name !== `/${identity(installId)}` ||
    Object.keys(inspected.NetworkSettings?.Networks ?? {}).length !== 1 ||
    inspected.NetworkSettings?.Networks?.[`${project}_default`]?.Aliases?.length !== 1 ||
    inspected.NetworkSettings?.Networks?.[`${project}_default`]?.Aliases?.[0] !==
      identity(installId) ||
    Object.keys(inspected.HostConfig?.PortBindings ?? {}).length ||
    Object.values(inspected.NetworkSettings?.Ports ?? {}).some((ports) => ports !== null) ||
    unsafeContainerAccess(inspected) ||
    inspected.HostConfig?.Binds?.length !== 1 ||
    inspected.HostConfig.Binds[0] !== caBind
  ) {
    throw new Error('Foreign plugin container');
  }
}
function daemon(method, path, body) {
  return new Promise((resolve, reject) => {
    const request = dockerRequest({ socketPath, method, path }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 500, body: Buffer.concat(chunks) })
      );
    });
    request.on('error', reject);
    request.end(body);
  });
}
function allowed(method, path) {
  const inspect = path.match(/^\/images\/(.+)\/json$/);
  if (method === 'GET' && inspect) {
    try {
      return trustedImages.includes(decodeURIComponent(inspect[1])) ? 'image' : undefined;
    } catch {
      return undefined;
    }
  }
  if (method === 'POST' && path === '/images/create') return 'image';
  if (method === 'POST' && path === '/containers/create') return 'create';
  const match = path.match(/^\/containers\/([^/]+)(?:\/(json|start|stop|restart))?$/);
  if (
    match &&
    ((method === 'GET' && match[2] === 'json') ||
      (method === 'POST' && ['start', 'stop', 'restart'].includes(match[2])) ||
      (method === 'DELETE' && !match[2]))
  )
    return match[1];
  return undefined;
}
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const path = pathOf(incoming.url ?? '/');
    const rule = allowed(incoming.method, path);
    if (!rule) throw new Error('Docker API operation is not permitted');
    if (incoming.method === 'POST' && path === '/images/create') {
      const fromImage = new URL(incoming.url ?? '/', 'http://docker').searchParams.get('fromImage');
      if (!trustedImages.includes(fromImage)) throw new Error('Image pull is not permitted');
    }
    const create =
      rule === 'create' ? createPayload(incoming.url ?? '/', JSON.parse(body)) : undefined;
    if (rule !== 'image' && rule !== 'create') await assertOwned(decodeURIComponent(rule));
    const outgoingBody = create ? Buffer.from(JSON.stringify(create)) : body;
    const upstreamPath = create
      ? `/containers/create?name=${encodeURIComponent(identity(create.Labels['io.plexica.installation']))}`
      : incoming.url;
    const response = dockerRequest(
      {
        socketPath,
        method: incoming.method,
        path: upstreamPath,
        headers: create
          ? { 'content-type': 'application/json', 'content-length': outgoingBody.length }
          : incoming.headers,
      },
      (upstream) => {
        outgoing.writeHead(upstream.statusCode ?? 500, upstream.headers);
        upstream.pipe(outgoing);
      }
    );
    response.on('error', () => outgoing.writeHead(502).end('Docker control unavailable'));
    response.end(outgoingBody);
  } catch (error) {
    outgoing.writeHead(403).end(error.message);
  }
}).listen(2375, '0.0.0.0');

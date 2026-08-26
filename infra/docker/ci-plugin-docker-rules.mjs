import { createHash } from 'node:crypto';
import { URL } from 'node:url';

export const project = process.env.CI_RUNTIME_PROJECT;
// The single allowed bind: the project E2E Postgres CA staged on the Docker
// host under /run/plexica-ci (postgres-host-ca-init), bind-mounted read-only
// at the sidecars' container path. The host system bundle is never trusted.
export const caBind = '/run/plexica-ci/postgres-ca.crt:/tmp/plexica-postgres-ca.crt:ro';
const sidecarImage = process.env.PLUGIN_SIDECAR_IMAGE ?? '';
const harnessImage = process.env.CI_SIDECAR_HARNESS_IMAGE ?? '';
const digestPinned = /^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/)?[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?@sha256:[a-f0-9]{64}$/;
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!/^plexica-ci-[a-z0-9][a-z0-9-]{5,43}$/.test(project ?? '')) throw new Error('Invalid CI project');
export const trustedImages = [sidecarImage, harnessImage];
for (const [variable, image] of Object.entries({ PLUGIN_SIDECAR_IMAGE: sidecarImage, CI_SIDECAR_HARNESS_IMAGE: harnessImage }))
  if (!digestPinned.test(image))
    throw new Error(`${variable} must be a digest-pinned image reference`);

export function identity(installId) {
  const digest = createHash('sha256').update(installId).digest('hex').slice(0, 16);
  return `plexica-plugin-${scope()}-${digest}`;
}
function scope() { return `ci-${createHash('sha256').update(project).digest('hex').slice(0, 28)}`; }
export function labelsFor(installId) {
  return {
    'io.plexica.installation': installId,
    'io.plexica.runtime-scope': scope(),
    'io.plexica.runtime-project': project,
    'com.docker.compose.project': project,
  };
}
export function exactLabels(labels, installId) {
  // Order-insensitive: the daemon serialises label maps with sorted keys on
  // inspect, while create payloads carry client insertion order. A raw
  // JSON.stringify comparison therefore rejected legitimately owned
  // containers at start/stop/delete time (run 32762992133 follow-up).
  const expected = labelsFor(installId);
  const keys = Object.keys(expected);
  return (
    Object.keys(labels).length === keys.length &&
    keys.every((key) => labels[key] === expected[key])
  );
}
export function unsafeContainerAccess(inspected) {
  return (
    (inspected.HostConfig?.ExtraHosts ?? []).some((host) => host.includes('host-gateway')) ||
    (inspected.Config?.Env ?? []).some((entry) =>
      /(?:localhost|127\.0\.0\.1|host\.docker\.internal|host-gateway)/i.test(entry)
    )
  );
}
export function createPayload(url, body) {
  const requestUrl = new URL(url, 'http://docker');
  const name = requestUrl.searchParams.get('name');
  const labels = body.Labels ?? {};
  const installId = labels['io.plexica.installation'];
  const network = `${project}_default`;
  const endpoint = body.NetworkingConfig?.EndpointsConfig?.[network];
  const hostConfig = body.HostConfig ?? {};
  const allowed = [
    'Image',
    'Env',
    'ExposedPorts',
    'Entrypoint',
    'Cmd',
    'WorkingDir',
    'User',
    'Labels',
    'HostConfig',
    'NetworkingConfig',
  ];
  const safeHostConfig = Object.keys(hostConfig).every((key) =>
    ['Binds', 'NetworkMode', 'RestartPolicy', 'MemoryReservation', 'NanoCpus'].includes(key)
  );
  if (
    requestUrl.searchParams.size !== 1 ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    !uuid.test(installId ?? '') ||
    name !== identity(installId) ||
    !exactLabels(labels, installId) ||
    !trustedImages.includes(body.Image) ||
    (body.Env !== undefined &&
      (!Array.isArray(body.Env) || !body.Env.every((entry) => typeof entry === 'string'))) ||
    (body.ExposedPorts !== undefined &&
      (typeof body.ExposedPorts !== 'object' || Array.isArray(body.ExposedPorts))) ||
    !safeHostConfig ||
    hostConfig.NetworkMode !== network ||
    !Array.isArray(hostConfig.Binds) ||
    hostConfig.Binds.length !== 1 ||
    hostConfig.Binds[0] !== caBind ||
    (hostConfig.RestartPolicy !== undefined &&
      (hostConfig.RestartPolicy.Name !== 'unless-stopped' ||
        Object.keys(hostConfig.RestartPolicy).some((key) => key !== 'Name'))) ||
    (hostConfig.MemoryReservation !== undefined &&
      (!Number.isSafeInteger(hostConfig.MemoryReservation) || hostConfig.MemoryReservation < 0)) ||
    (hostConfig.NanoCpus !== undefined &&
      (!Number.isSafeInteger(hostConfig.NanoCpus) || hostConfig.NanoCpus < 0)) ||
    Object.keys(body.NetworkingConfig?.EndpointsConfig ?? {}).length !== 1 ||
    Object.keys(endpoint ?? {}).length !== 1 ||
    endpoint?.Aliases?.length !== 1 ||
    endpoint.Aliases[0] !== name
  ) {
    throw new Error('Unsafe plugin create request');
  }
  return {
    Image: body.Image,
    ...(body.Env ? { Env: body.Env } : {}),
    ...(body.ExposedPorts ? { ExposedPorts: body.ExposedPorts } : {}),
    ...(body.Entrypoint ? { Entrypoint: body.Entrypoint } : {}),
    ...(body.Cmd ? { Cmd: body.Cmd } : {}),
    ...(body.WorkingDir ? { WorkingDir: body.WorkingDir } : {}),
    ...(body.User ? { User: body.User } : {}),
    Labels: labelsFor(installId),
    HostConfig: {
      Binds: [caBind],
      NetworkMode: network,
      ...(hostConfig.RestartPolicy ? { RestartPolicy: hostConfig.RestartPolicy } : {}),
      ...(Number.isSafeInteger(hostConfig.MemoryReservation)
        ? { MemoryReservation: hostConfig.MemoryReservation }
        : {}),
      ...(Number.isSafeInteger(hostConfig.NanoCpus) ? { NanoCpus: hostConfig.NanoCpus } : {}),
    },
    NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: [name] } } },
  };
}

import { rm } from 'node:fs/promises';

import {
  call,
  daemonRef,
  forwarded,
  harnessImage,
  installId,
  name,
  pinnedImage,
  project,
  proxy,
  scope,
  temp,
} from './ci-plugin-docker-proxy.test-harness.mjs';

try {
  const create = JSON.stringify({
    // This is the Dockerode payload produced by DockerContainerManager in CI.
    Image: pinnedImage,
    Env: ['CORE_API_URL=http://core-api-e2e:3001'],
    ExposedPorts: { '3000/tcp': {} },
    Labels: { 'io.plexica.installation': installId, 'io.plexica.runtime-scope': scope, 'com.docker.compose.project': project },
    HostConfig: {
      Binds: ['/etc/ssl/certs/ca-certificates.crt:/tmp/plexica-postgres-ca.crt:ro'],
      NetworkMode: `${project}_default`,
      RestartPolicy: { Name: 'unless-stopped' },
      NanoCpus: 250000000,
    },
    NetworkingConfig: { EndpointsConfig: { [`${project}_default`]: { Aliases: [name] } } },
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if ((await call('POST', `/containers/create?name=${name}`, create)) !== 201)
    throw new Error('Scoped plugin create was not proxied');
  const created = JSON.parse(forwarded[0].body);
  if (
    forwarded[0].url !== `/containers/create?name=${name}` ||
    created.HostConfig.NetworkMode !== `${project}_default` ||
    created.HostConfig.Binds?.[0] !== '/etc/ssl/certs/ca-certificates.crt:/tmp/plexica-postgres-ca.crt:ro' ||
    created.NetworkingConfig.EndpointsConfig[`${project}_default`].Aliases[0] !== name ||
    created.HostConfig.PortBindings ||
    created.HostConfig.ExtraHosts ||
    created.Privileged
  )
    throw new Error('Core CI create payload was not reduced to the approved sidecar contract');
  if ((await call('POST', `/containers/create?name=${name}`, create.replace(pinnedImage, harnessImage))) !== 201)
    throw new Error('Harness sidecar image create was not proxied');
  if (JSON.parse(forwarded.at(-1).body).Image !== harnessImage)
    throw new Error('Harness sidecar image was not preserved in the proxied payload');
  if (
    (await call(
      'POST',
      `/containers/create?name=${name}`,
      create.replace(
        `"NetworkMode":"${project}_default"`,
        `"NetworkMode":"${project}_default","Privileged":true`
      )
    )) !== 403
  )
    throw new Error('Privileged plugin create was accepted');
  for (const labels of [
    { 'io.plexica.installation': installId, 'io.plexica.runtime-scope': scope },
    { 'io.plexica.installation': installId, 'io.plexica.runtime-scope': scope, 'com.docker.compose.project': 'plexica-ci-foreign-123456' },
  ]) {
    const forged = JSON.parse(create);
    forged.Labels = labels;
    if ((await call('POST', `/containers/create?name=${name}`, JSON.stringify(forged))) !== 403)
      throw new Error('Forged plugin ownership labels were accepted');
  }
  for (const hostConfig of [
    { PortBindings: { '3000/tcp': [{ HostPort: '32000' }] } },
    { ExtraHosts: ['host.docker.internal:host-gateway'] },
  ]) {
    const unsafe = JSON.parse(create);
    Object.assign(unsafe.HostConfig, hostConfig);
    if ((await call('POST', `/containers/create?name=${name}`, JSON.stringify(unsafe))) !== 403)
      throw new Error('Client-provided port or host-gateway configuration was accepted');
  }
  if (
    (await call(
      'POST',
      `/containers/create?name=${name}`,
      create.replace('"Aliases":[', '"IPv4Address":"172.20.0.9","Aliases":[')
    )) !== 403
  )
    throw new Error('Client-provided network settings were accepted');
  await assertLifecycleAndInspectionRules();
  await assertCreateQueryAndImageTrust(create);
} finally {
  proxy.kill();
  daemonRef.close();
  await rm(temp, { recursive: true, force: true });
}

async function assertLifecycleAndInspectionRules() {
  if ((await call('POST', '/containers/container-id/start')) !== 201)
    throw new Error('Owned plugin lifecycle proxy was not forwarded');
  if (!forwarded.some(({ url }) => url?.includes('/containers/container-id/start')))
    throw new Error('Lifecycle request did not reach Docker');
  if ((await call('POST', '/containers/malformed/restart')) !== 403)
    throw new Error('Malformed existing plugin container was accepted for restart');
  if ((await call('POST', '/containers/foreign/restart')) !== 403)
    throw new Error('Foreign existing plugin container was accepted for recovery');
  for (const [method, path] of [
    ['GET', '/containers/foreign/json'],
    ['DELETE', '/containers/foreign'],
  ]) {
    if ((await call(method, path)) !== 403)
      throw new Error('Foreign plugin container was accepted for inspect or cleanup');
  }
}

async function assertCreateQueryAndImageTrust(create) {
  if ((await call('POST', `/containers/create?name=${name}&privileged=yes`, create)) !== 403)
    throw new Error('Unexpected create query was accepted');
  for (const image of [
    'node:24-bookworm',
    'node:24@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584',
    'evil/registry.example.com/image@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584',
    pinnedImage.slice(0, -1),
    'alpine:3.20@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ]) {
    const foreign = create.replace(pinnedImage, image);
    if ((await call('POST', `/containers/create?name=${name}`, foreign)) !== 403)
      throw new Error(`Untrusted plugin image "${image}" was accepted`);
  }
  if ((await call('POST', `/images/create?fromImage=${encodeURIComponent(pinnedImage)}`)) !== 201)
    throw new Error('Trusted image pull was not proxied');
  await assertImageInspectTrust();
  await assertImagePullTrust();
}

async function assertImageInspectTrust() {
  for (const image of [pinnedImage, harnessImage]) {
    if ((await call('GET', `/images/${encodeURIComponent(image)}/json`)) !== 200)
      throw new Error(`Trusted image inspect "${image}" was not proxied`);
  }
  for (const reference of [
    'alpine:3.20',
    `${pinnedImage.slice(0, -1)}0`,
    encodeURIComponent('node@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    '%2E%2E%2Fcontainers%2Fforeign',
  ]) {
    if ((await call('GET', `/images/${reference}/json`)) !== 403)
      throw new Error(`Untrusted or hostile image inspect "${reference}" was accepted`);
  }
}

async function assertImagePullTrust() {
  for (const fromImage of [
    'alpine:3.20',
    `node:24@sha256:${'a'.repeat(64)}`,
    `${pinnedImage.slice(0, -1)}0`,
  ]) {
    if ((await call('POST', `/images/create?fromImage=${encodeURIComponent(fromImage)}`)) !== 403)
      throw new Error(`Untrusted image pull "${fromImage}" was accepted`);
  }
}

import { assertCiPluginContainer } from './plugin-container-contract.js';
import { dockerRuntimeOptions } from './docker-runtime-options.js';
import { dockerodeCreateOptions } from './dockerode-create-options.js';
import { isCiPluginRuntime, pluginContainerIdentity } from './plugin-container-identity.js';
import { resolveSidecarImage } from './sidecar-image.js';

import type Docker from 'dockerode';

function mergeEnvironment(
  current: string[] | undefined,
  overrides: Record<string, string>
): string[] {
  const keys = new Set(Object.keys(overrides));
  const retained = (current ?? []).filter((entry) => !keys.has(entry.split('=', 1)[0] ?? ''));
  return [...retained, ...Object.entries(overrides).map(([key, value]) => `${key}=${value}`)];
}

function replacementOptions(
  installId: string,
  inspect: Docker.ContainerInspectInfo,
  environment: Record<string, string>
): Omit<Docker.ContainerCreateOptions, 'name'> {
  const identity = pluginContainerIdentity(installId);
  if (!isCiPluginRuntime()) {
    return {
      ...inspect.Config,
      Env: mergeEnvironment(inspect.Config.Env, environment),
      HostConfig: inspect.HostConfig,
    } as Omit<Docker.ContainerCreateOptions, 'name'>;
  }
  const image = resolveSidecarImage(inspect.Config.Image ?? '');
  const runtime = dockerRuntimeOptions(installId);
  return {
    Image: image,
    Env: mergeEnvironment(inspect.Config.Env, environment),
    Labels: identity.labels,
    ExposedPorts: inspect.Config.ExposedPorts,
    ...(inspect.Config.Entrypoint ? { Entrypoint: inspect.Config.Entrypoint } : {}),
    ...(inspect.Config.Cmd ? { Cmd: inspect.Config.Cmd } : {}),
    ...(inspect.Config.WorkingDir ? { WorkingDir: inspect.Config.WorkingDir } : {}),
    ...(inspect.Config.User ? { User: inspect.Config.User } : {}),
    NetworkingConfig: { EndpointsConfig: { [identity.network]: { Aliases: [identity.alias] } } },
    HostConfig: { RestartPolicy: { Name: 'unless-stopped' }, ...runtime.hostConfig },
  } as Omit<Docker.ContainerCreateOptions, 'name'>;
}

export async function restartDockerContainer(
  docker: Docker,
  installId: string,
  environment?: Record<string, string>
): Promise<number | undefined> {
  const identity = pluginContainerIdentity(installId);
  const name = identity.name;
  const existing = docker.getContainer(name);
  const inspected = await existing.inspect();
  assertCiPluginContainer(identity, inspected);
  if (environment === undefined) {
    await existing.restart();
    assertCiPluginContainer(identity, await existing.inspect());
    return undefined;
  }

  const createOptions = replacementOptions(installId, inspected, environment);
  await existing.stop({ t: 10 }).catch((error: unknown) => {
    if (!(error as Error).message.includes('already stopped')) throw error;
  });
  await existing.remove({ force: true });
  const replacement = await docker.createContainer(dockerodeCreateOptions(identity.name, createOptions));
  await replacement.start();
  // Post-start contract assert: on failure the just-started replacement is
  // rogue (unverified identity), so remove it before propagating the error —
  // same remove-and-rethrow contract as startContainer.
  const replacementState = await replacement.inspect();
  try {
    assertCiPluginContainer(identity, replacementState);
  } catch (error) {
    await replacement.remove({ force: true, v: true }).catch(() => undefined);
    throw error;
  }
  for (const bindings of Object.values(replacementState.NetworkSettings.Ports ?? {})) {
    const hostPort = bindings?.[0]?.HostPort;
    if (hostPort) return Number(hostPort);
  }
  return undefined;
}

import type Docker from 'dockerode';

function mergeEnvironment(
  current: string[] | undefined,
  overrides: Record<string, string>
): string[] {
  const keys = new Set(Object.keys(overrides));
  const retained = (current ?? []).filter((entry) => !keys.has(entry.split('=', 1)[0] ?? ''));
  return [...retained, ...Object.entries(overrides).map(([key, value]) => `${key}=${value}`)];
}

export async function restartDockerContainer(
  docker: Docker,
  installId: string,
  environment?: Record<string, string>
): Promise<number | undefined> {
  const name = `plexica-plugin-${installId}`;
  const existing = docker.getContainer(name);
  if (environment === undefined) {
    await existing.restart();
    return undefined;
  }

  const inspected = await existing.inspect();
  const createOptions = {
    ...inspected.Config,
    name,
    Env: mergeEnvironment(inspected.Config.Env, environment),
    HostConfig: inspected.HostConfig,
  } as Docker.ContainerCreateOptions;
  await existing.stop({ t: 10 }).catch((error: unknown) => {
    if (!(error as Error).message.includes('already stopped')) throw error;
  });
  await existing.remove({ force: true });
  const replacement = await docker.createContainer(createOptions);
  await replacement.start();
  const replacementState = await replacement.inspect();
  for (const bindings of Object.values(replacementState.NetworkSettings.Ports ?? {})) {
    const hostPort = bindings?.[0]?.HostPort;
    if (hostPort) return Number(hostPort);
  }
  return undefined;
}

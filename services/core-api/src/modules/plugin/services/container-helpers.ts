// container-helpers.ts
// Shared helpers for container resource parsing.
// Extracted from container-manager.service.ts to stay under 200 lines.

export function parseMemory(mem?: string): number | undefined {
  if (!mem) return undefined;
  const match = mem.match(/^(\d+)(Mi|Gi)$/);
  if (!match?.[1]) return undefined;
  const val = parseInt(match[1], 10);
  return match[2] === 'Gi' ? val * 1024 * 1024 * 1024 : val * 1024 * 1024;
}

export function parseCpu(cpu?: string): number | undefined {
  if (!cpu) return undefined;
  const val = parseFloat(cpu);
  return isNaN(val) ? undefined : val * 1_000_000_000; // 1 CPU = 10^9 nanocores
}

// Port resolution order: a published host binding wins so local proxy URLs
// point at the daemon-assigned host port (local containers are created with
// HostPort '0', and the first ExposedPorts entry is the container-side port,
// which is unreachable from localhost). Containers without bindings — the CI
// runtime contract forbids publishing — resolve to the exposed port, which is
// exactly the manifest hosting port that in-network consumers must use.
export function containerPort(
  inspect: {
    Config: { ExposedPorts?: Record<string, unknown> };
    NetworkSettings: { Ports?: Record<string, Array<{ HostPort?: string } | null> | null> };
  }
): number | undefined {
  for (const bindings of Object.values(inspect.NetworkSettings.Ports ?? {})) {
    const hostPort = bindings?.[0]?.HostPort;
    if (hostPort && hostPort !== '0') return Number(hostPort);
  }
  const exposed = Object.keys(inspect.Config.ExposedPorts ?? {})[0]?.split('/')[0];
  if (exposed) return Number(exposed);
  return undefined;
}

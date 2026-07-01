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

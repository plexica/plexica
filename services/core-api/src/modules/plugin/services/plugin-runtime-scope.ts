import { createHash } from 'node:crypto';

export function pluginRuntimeScope(project: string): string {
  return `ci-${createHash('sha256').update(project).digest('hex').slice(0, 28)}`;
}

const CORE_TOPICS = [
  'plexica.workspace.created',
  'plexica.workspace.updated',
  'plexica.workspace.deleted',
  'plexica.user.invited',
  'plexica.user.joined',
  'plexica.user.removed',
  'plexica.tenant.created',
  'plexica.tenant.suspended',
  'plexica.tenant.deleted',
  'plexica.plugin.installed',
  'plexica.plugin.activated',
  'plexica.plugin.deactivated',
  'plexica.plugin.uninstalled',
] as const;

const PATTERN_MAP: Record<string, string[]> = {
  'plexica.workspace.*': CORE_TOPICS.slice(0, 3),
  'plexica.user.*': CORE_TOPICS.slice(3, 6),
  'plexica.tenant.*': CORE_TOPICS.slice(6, 9),
  'plexica.plugin.*': CORE_TOPICS.slice(9),
  'plexica.*': [...CORE_TOPICS],
};

export function resolvePatterns(patterns: string[]): string[] {
  const resolved = new Set<string>();
  for (const pattern of patterns) {
    const mapped = PATTERN_MAP[pattern];
    if (mapped) mapped.forEach((topic) => resolved.add(topic));
    else if (
      (CORE_TOPICS as readonly string[]).includes(pattern) ||
      pattern.startsWith('plugin.')
    ) {
      resolved.add(pattern);
    }
  }
  return [...resolved];
}

export function getCoreTopics(): readonly string[] {
  return CORE_TOPICS;
}

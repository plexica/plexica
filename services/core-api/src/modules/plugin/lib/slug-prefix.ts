// lib/slug-prefix.ts
// Plugin table name construction helpers (DR-17 naming convention).

const TABLE_NAME_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

export function tableName(slug: string, table: string): string {
  if (!TABLE_NAME_REGEX.test(table)) {
    throw new Error(`Invalid table name: "${table}". Must be snake_case, max 64 chars.`);
  }
  return `${slug}_${table}`;
}

export function validateTableName(name: string): boolean {
  const pluginTableRegex = /^[a-z][a-z0-9-]{1,62}_[a-z][a-z0-9_]{1,63}$/;
  return pluginTableRegex.test(name);
}

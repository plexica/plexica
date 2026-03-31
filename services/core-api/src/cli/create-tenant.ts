// create-tenant.ts
// CLI entrypoint for the tenant:create command.
// Usage: pnpm --filter core-api tenant:create -- --slug <slug>

import { createTenantSchema } from '../lib/tenant-schema.js';
import { disconnectDatabase } from '../lib/database.js';

function parseArgs(argv: string[]): { slug: string | undefined } {
  const slugIndex = argv.indexOf('--slug');
  if (slugIndex === -1 || slugIndex + 1 >= argv.length) {
    return { slug: undefined };
  }
  return { slug: argv[slugIndex + 1] };
}

async function main(): Promise<void> {
  const { slug } = parseArgs(process.argv.slice(2));

  if (slug === undefined || slug === '') {
    process.stderr.write('Usage: tenant:create -- --slug <slug>\n');
    process.stderr.write('Example: pnpm --filter core-api tenant:create -- --slug acme\n');
    process.exit(1);
  }

  const result = await createTenantSchema(slug);

  if (result.success) {
    process.stdout.write(`Tenant ${slug} created successfully (schema: ${result.schemaName})\n`);
    process.exit(0);
  } else {
    process.stderr.write(`Error: ${result.error?.message ?? 'Unknown error'}\n`);
    process.exit(1);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${String(error)}\n`);
    process.exit(1);
  })
  .finally(() => {
    void disconnectDatabase();
  });

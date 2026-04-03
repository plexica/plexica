// create-tenant.ts
// CLI entrypoint for the tenant:create command.
// Runs full tenant provisioning: PostgreSQL schema + Keycloak realm + MinIO bucket.
// Usage: pnpm --filter core-api tenant:create -- --slug <slug> [--name <name>] [--admin-email <email>]

import { disconnectDatabase } from '../lib/database.js';
import { provisionTenant } from '../modules/tenant/tenant-provisioning.js';

interface CliArgs {
  slug: string | undefined;
  name: string | undefined;
  adminEmail: string | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  function nextArg(flag: string): string | undefined {
    const idx = argv.indexOf(flag);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  }

  return {
    slug: nextArg('--slug'),
    name: nextArg('--name'),
    adminEmail: nextArg('--admin-email'),
  };
}

async function main(): Promise<void> {
  const { slug, name, adminEmail } = parseArgs(process.argv.slice(2));

  if (slug === undefined || slug === '') {
    process.stderr.write(
      'Usage: tenant:create -- --slug <slug> [--name <name>] [--admin-email <email>]\n'
    );
    process.stderr.write(
      'Example: pnpm --filter core-api tenant:create -- --slug acme --name "Acme Corp" --admin-email admin@acme.local\n'
    );
    process.exit(1);
  }

  const resolvedName = name ?? slug;
  const resolvedEmail = adminEmail ?? `admin@${slug}.local`;

  process.stdout.write(`Provisioning tenant "${resolvedName}" (slug: ${slug})…\n`);

  const result = await provisionTenant({
    slug,
    name: resolvedName,
    adminEmail: resolvedEmail,
  });

  process.stdout.write(`Tenant provisioned successfully.\n`);
  process.stdout.write(`  Schema:       ${result.schemaName}\n`);
  process.stdout.write(`  Realm:        ${result.realmName}\n`);
  process.stdout.write(`  MinIO bucket: ${result.minioBucket}\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Initial admin credentials:\n`);
  process.stdout.write(`  Username: ${resolvedEmail}\n`);
  process.stdout.write(
    `  Password: ${result.tempPassword}  ← temporary, must be changed on first login\n`
  );
  process.stdout.write(`\nAccess the web UI at: http://localhost:3000?tenant=${slug}\n`);
  process.exit(0);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${String(error)}\n`);
    process.exit(1);
  })
  .finally(() => {
    void disconnectDatabase();
  });

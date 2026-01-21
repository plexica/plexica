import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig, env } from 'prisma/config';

// Load .env from monorepo root
config({ path: resolve(__dirname, '../../../.env') });

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

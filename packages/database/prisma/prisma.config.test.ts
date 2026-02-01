import { defineConfig } from 'prisma/config';

// For test environment, use explicit DATABASE_URL
export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core',
  },
});

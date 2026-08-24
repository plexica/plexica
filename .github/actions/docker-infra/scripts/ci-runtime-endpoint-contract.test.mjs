import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const script = fileURLToPath(new URL('./ci-runtime-endpoint-contract.mjs', import.meta.url));

function accepts(key, value) {
  return spawnSync(process.execPath, [script, 'host', key, value]).status === 0;
}

function acceptsContainer(key, value) {
  return spawnSync(process.execPath, [script, 'container', key, value]).status === 0;
}

if (!accepts('POSTGRES_HOST_URL', 'postgresql://user:password@127.0.0.1:32123/plexica')) {
  throw new Error('Credentialed inspected PostgreSQL host URL was rejected');
}
for (const [key, value] of [
  ['KAFKA_BROKERS', 'redpanda:9092'],
  ['PLUGIN_DB_SSL_MODE', 'verify-full'],
  ['PLUGIN_RUNTIME_SCOPE', 'ci-0123456789abcdef0123456789ab'],
  ['KEYCLOAK_ADMIN_PASSWORD', 'not-a-url'],
  ['EVENT_KEY_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  ['PLUGIN_DB_ENCRYPTION_KEY', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['PLUGIN_CREDENTIAL_PEPPER', '0123456789abcdef0123456789abcdef'],
]) {
  if (!acceptsContainer(key, value)) throw new Error(`Rejected approved scalar contract ${key}`);
}
if (acceptsContainer('KAFKA_BROKERS', 'http://redpanda:9092')) {
  throw new Error('Accepted a URL where the Kafka scalar contract is required');
}
for (const [key, value] of [
  ['POSTGRES_HOST_URL', 'postgresql://user@127.0.0.1:32123/plexica'],
  ['POSTGRES_HOST_URL', 'postgresql://user:password@postgres:5432/plexica'],
  ['REDIS_HOST_URL', 'redis://user:password@127.0.0.1:32123'],
  ['KEYCLOAK_HOST_ADMIN_BASE', 'http://user:password@127.0.0.1:32123'],
]) {
  if (accepts(key, value)) throw new Error(`Accepted unsafe host endpoint for ${key}`);
}

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const parser = join(
  dirname(new URL(import.meta.url).pathname),
  '../../../scripts/parse-postgres-url.sh'
);

function parseUrl(url: string): { host: string; port: string } {
  const stdout = execFileSync('bash', [
    '-c',
    `source '${parser}' && parse_postgres_url "$1" && printf '%s\\n%s\\n' "$PARSED_PG_HOST" "$PARSED_PG_PORT"`,
    'parse-postgres-url-test',
    url,
  ]);
  const [host, port] = stdout.toString().trim().split('\n');
  if (host === undefined || port === undefined) {
    throw new Error(`unexpected parser output: ${stdout.toString()}`);
  }
  return { host, port };
}

describe('check-test-env — DATABASE_URL dynamic host/port parsing', () => {
  it('parses a dynamic CI port from DATABASE_URL', () => {
    expect(
      parseUrl('postgresql://plexica:secret@127.0.0.1:54329/plexica?sslmode=disable')
    ).toEqual({ host: '127.0.0.1', port: '54329' });
  });

  it('defaults the port to 5432 when absent', () => {
    expect(parseUrl('postgresql://plexica@db.internal/plexica')).toEqual({
      host: 'db.internal',
      port: '5432',
    });
  });

  it('strips userinfo including special characters', () => {
    expect(
      parseUrl('postgresql://user%40x:p%40ss@10.0.5.9:65432/db')
    ).toEqual({ host: '10.0.5.9', port: '65432' });
  });

  it('drops query strings and fragments before parsing', () => {
    expect(
      parseUrl('postgresql://u:p@pg-1:5433/db#frag')
    ).toEqual({ host: 'pg-1', port: '5433' });
  });

  it('parses IPv6 literals with a port', () => {
    expect(parseUrl('postgresql://u:p@[::1]:54444/db')).toEqual({
      host: '::1',
      port: '54444',
    });
  });

  it('falls back to the default port on a non-numeric port', () => {
    expect(parseUrl('postgresql://u:p@localhost:notaport/db')).toEqual({
      host: 'localhost',
      port: '5432',
    });
  });

  it('parses a URL without a scheme prefix gracefully', () => {
    expect(parseUrl('127.0.0.1:54321/plexica')).toEqual({
      host: '127.0.0.1',
      port: '54321',
    });
  });
});

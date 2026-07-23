import { describe, expect, it } from 'vitest';

import { prepareMigrationSql } from '../../modules/plugin/schema/migrations.js';

describe('plugin migration parser corpus', () => {
  it('serializes approved statements without splitting comments or quoted semicolons', () => {
    const result = prepareMigrationSql(
      `-- comment with ; terminators ;
       CREATE TABLE crm_notes (
         id UUID PRIMARY KEY,
         note TEXT DEFAULT 'first;second',
         marker TEXT DEFAULT '/* not a comment; */'
       );
       /* block ; comment */
       CREATE INDEX idx_crm_notes_note ON crm_notes(note);`,
      'crm'
    );
    expect(result.errors).toEqual([]);
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toContain("DEFAULT 'first;second'");
    expect(result.statements[0]).toContain("DEFAULT '/* not a comment; */'");
    expect(result.statements[1]).toContain('CREATE INDEX');
  });

  it('allows additive ALTER TABLE and plugin-local references', () => {
    const result = prepareMigrationSql(
      `CREATE TABLE crm_child (
         id UUID PRIMARY KEY,
         parent_id UUID REFERENCES crm_parent(id)
       );
       ALTER TABLE crm_child ADD COLUMN note TEXT DEFAULT 'a;b';`,
      'crm'
    );
    expect(result.valid).toBe(true);
    expect(result.statements).toHaveLength(2);
  });

  it.each([
    'ALTER TABLE crm_notes DROP COLUMN note',
    'CREATE TABLE crm_notes AS SELECT * FROM core.tenants',
    'CREATE TABLE crm_notes (id UUID REFERENCES other_secret(id))',
    'CREATE TABLE public.crm_notes (id UUID)',
    'INSERT INTO crm_notes(id) VALUES (gen_random_uuid())',
    'GRANT SELECT ON crm_notes TO PUBLIC',
    'CREATE FUNCTION crm_exploit() RETURNS void LANGUAGE SQL AS $$ SELECT 1 $$',
  ])('rejects disallowed SQL: %s', (sql) => {
    const result = prepareMigrationSql(sql, 'crm');
    expect(result.valid).toBe(false);
    expect(result.statements).toEqual([]);
  });
});

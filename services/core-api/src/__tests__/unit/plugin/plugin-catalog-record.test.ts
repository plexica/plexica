import { describe, expect, it } from 'vitest';

import { toPluginCatalogRecord } from '../../../modules/plugin/services/plugin-catalog-record.js';

const catalogRow = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  status: 'draft',
  reviewStatus: 'none',
  author: 'Test Author',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('plugin catalog record', () => {
  it('maps every public catalog field', () => {
    expect(toPluginCatalogRecord(catalogRow)).toEqual({
      id: catalogRow.id,
      slug: catalogRow.slug,
      name: catalogRow.name,
      version: catalogRow.version,
      description: catalogRow.description,
      status: catalogRow.status,
      reviewStatus: catalogRow.reviewStatus,
      author: catalogRow.author,
      createdAt: catalogRow.createdAt,
      updatedAt: catalogRow.updatedAt,
    });
  });

  it('normalizes a nullable description to an empty string', () => {
    expect(toPluginCatalogRecord({ ...catalogRow, description: null }).description).toBe('');
  });

  it('rejects an invalid persisted plugin status', () => {
    expect(() => toPluginCatalogRecord({ ...catalogRow, status: 'legacy' })).toThrowError(
      'Invalid plugin status stored in database'
    );
  });

  it('rejects an invalid persisted review status', () => {
    expect(() => toPluginCatalogRecord({ ...catalogRow, reviewStatus: 'legacy' })).toThrowError(
      'Invalid plugin review status stored in database'
    );
  });
});

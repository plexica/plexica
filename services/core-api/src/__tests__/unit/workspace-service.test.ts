// workspace-service.test.ts
// Pure-logic unit tests for workspace utilities (no DB, no network).
// Covers: materialized path math, cycle detection, depth limits, slug generation,
// and template instantiation structure.

import { describe, expect, it } from 'vitest';

import { generateSlug, isValidSlug, SLUG_REGEX } from '../../lib/slug.js';

// ---------------------------------------------------------------------------
// Materialized path helpers — inlined here because pathDepth is not exported.
// These mirror the exact implementation in service.ts / service-archive.ts.
// ---------------------------------------------------------------------------

function pathDepth(p: string): number {
  return p.split('/').filter(Boolean).length;
}

function buildChildPath(parentPath: string, childSlug: string): string {
  // parentPath ends with '/' for root ("/") or "/<seg>/" for non-root.
  return `${parentPath}${childSlug}/`;
}

function buildRootPath(id: string): string {
  return `/${id}/`;
}

function isAncestor(candidateId: string, currentPath: string): boolean {
  // Segments of the path are the ancestor IDs
  const segments = currentPath.split('/').filter(Boolean);
  return segments.includes(candidateId);
}

// ---------------------------------------------------------------------------
// Template instantiation helper (mirrors seedTemplateChildren logic)
// ---------------------------------------------------------------------------

interface ChildDef {
  name: string;
  description?: string;
}

interface WorkspaceCreateInput {
  name: string;
  slug: string;
  description: string | null;
  parentId: string;
  materializedPath: string;
  createdBy: string;
}

function instantiateTemplate(
  children: ChildDef[],
  parentId: string,
  parentPath: string,
  userId: string
): WorkspaceCreateInput[] {
  return children.map((child) => {
    const slug = generateSlug(child.name);
    return {
      name: child.name,
      slug,
      description: child.description ?? null,
      parentId,
      materializedPath: `${parentPath}${slug}/`,
      createdBy: userId,
    };
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('pathDepth()', () => {
  it('root path "/" has depth 0', () => {
    expect(pathDepth('/')).toBe(0);
  });

  it('single segment has depth 1', () => {
    expect(pathDepth('/a/')).toBe(1);
  });

  it('three segments has depth 3', () => {
    expect(pathDepth('/a/b/c/')).toBe(3);
  });

  it('eleven segments (depth 11) exceeds the 10-level limit', () => {
    const p = '/a/b/c/d/e/f/g/h/i/j/k/';
    expect(pathDepth(p)).toBe(11);
    expect(pathDepth(p)).toBeGreaterThan(10);
  });

  it('ten segments (depth 10) is exactly at the limit — accepted', () => {
    const p = '/a/b/c/d/e/f/g/h/i/j/';
    expect(pathDepth(p)).toBe(10);
  });
});

describe('buildChildPath()', () => {
  it('appends child slug to root parent path "/"', () => {
    expect(buildChildPath('/', 'alpha')).toBe('/alpha/');
  });

  it('appends child slug to nested parent path "/a/b/"', () => {
    expect(buildChildPath('/a/b/', 'c')).toBe('/a/b/c/');
  });
});

describe('buildRootPath()', () => {
  const id = 'abc-123';
  it('returns /<id>/', () => {
    expect(buildRootPath(id)).toBe('/abc-123/');
  });
});

describe('isAncestor() — cycle detection', () => {
  it('detects cycle: candidate "b" is in path "/a/b/c/"', () => {
    expect(isAncestor('b', '/a/b/c/')).toBe(true);
  });

  it('no cycle: candidate "d" is NOT in path "/a/b/c/"', () => {
    expect(isAncestor('d', '/a/b/c/')).toBe(false);
  });

  it('self is an ancestor of its own path', () => {
    expect(isAncestor('c', '/a/b/c/')).toBe(true);
  });
});

describe('generateSlug()', () => {
  it('"My Workspace" → "my-workspace"', () => {
    expect(generateSlug('My Workspace')).toBe('my-workspace');
  });

  it('"Hello World!!!" → "hello-world"', () => {
    expect(generateSlug('Hello World!!!')).toBe('hello-world');
  });

  it('"  spaces  " → "spaces"', () => {
    expect(generateSlug('  spaces  ')).toBe('spaces');
  });

  it('"123" → starts with a letter (prepend "w")', () => {
    const slug = generateSlug('123');
    expect(slug).toMatch(/^[a-z]/);
    expect(slug).toBe('w123');
  });

  it('result is always valid per SLUG_REGEX', () => {
    for (const name of ['My Workspace', 'Hello World!!!', '  spaces  ', '123', 'A']) {
      expect(SLUG_REGEX.test(generateSlug(name))).toBe(true);
    }
  });
});

describe('isValidSlug()', () => {
  it('"valid-slug" → true', () => {
    expect(isValidSlug('valid-slug')).toBe(true);
  });

  it('"1invalid" (starts with digit) → false', () => {
    expect(isValidSlug('1invalid')).toBe(false);
  });

  it('"UPPER" (uppercase) → false', () => {
    expect(isValidSlug('UPPER')).toBe(false);
  });

  it('"ab" (2 chars total, meets min) → true', () => {
    expect(isValidSlug('ab')).toBe(true);
  });
});

describe('instantiateTemplate()', () => {
  it('returns one entry per child definition', () => {
    const children: ChildDef[] = [{ name: 'Alpha' }, { name: 'Beta' }];
    const result = instantiateTemplate(children, 'parent-id', '/parent/', 'user-1');
    expect(result).toHaveLength(2);
  });

  it('each entry has correct parentId and createdBy', () => {
    const children: ChildDef[] = [{ name: 'Alpha' }, { name: 'Beta' }];
    const result = instantiateTemplate(children, 'p-id', '/p/', 'u-id');
    for (const entry of result) {
      expect(entry.parentId).toBe('p-id');
      expect(entry.createdBy).toBe('u-id');
    }
  });

  it('materializedPath is built from parentPath + slug', () => {
    const children: ChildDef[] = [{ name: 'Alpha' }];
    const result = instantiateTemplate(children, 'p-id', '/p/', 'u-id');
    expect(result[0]?.materializedPath).toBe('/p/alpha/');
  });

  it('empty template structure returns empty array', () => {
    const result = instantiateTemplate([], 'p-id', '/p/', 'u-id');
    expect(result).toHaveLength(0);
  });
});

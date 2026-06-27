// CLI generator tests

import { describe, expect, it } from 'vitest';

// Test the template rendering function directly
function render(template: string, slug: string, name: string): string {
  return template.replace(/\{\{slug\}\}/g, slug).replace(/\{\{name\}\}/g, name);
}

describe('CLI template rendering', () => {
  it('replaces {{slug}} in manifest', () => {
    const template = '{"slug": "{{slug}}"}';
    expect(render(template, 'my-plugin', 'My Plugin')).toBe('{"slug": "my-plugin"}');
  });

  it('replaces {{name}} in manifest', () => {
    const template = '{"name": "{{name}}"}';
    expect(render(template, 'my-plugin', 'My Plugin')).toBe('{"name": "My Plugin"}');
  });

  it('replaces both slug and name', () => {
    const template = '{"slug": "{{slug}}", "name": "{{name}}"}';
    const result = render(template, 'my-crm', 'My CRM');
    expect(result).toContain('"slug": "my-crm"');
    expect(result).toContain('"name": "My CRM"');
  });

  it('handles package.json template', () => {
    const tmpl = `"name": "{{slug}}"`;
    expect(render(tmpl, 'test-plugin', 'TP')).toBe('"name": "test-plugin"');
  });

  it('handles dev-entry.ts template', () => {
    const tmpl = "slug: '{{slug}}'";
    expect(render(tmpl, 'my-plugin', 'My Plugin')).toBe("slug: 'my-plugin'");
  });
});

describe('Slug generation', () => {
  it('converts name to lowercase kebab', () => {
    const name = 'My CRM Plugin';
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').substring(0, 62);
    expect(slug).toBe('my-crm-plugin');
  });

  it('removes leading/trailing hyphens', () => {
    const name = '-test-';
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').substring(0, 62);
    expect(slug).toBe('test');
  });

  it('truncates to 62 chars', () => {
    const name = 'a'.repeat(100);
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').substring(0, 62);
    expect(slug.length).toBe(62);
  });
});

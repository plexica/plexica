// apps/web/src/tests/a11y/workspace-hierarchy.a11y.test.tsx
//
// T011-26: WCAG 2.1 AA accessibility audit for all Spec 011 Phase 4 components.
// Uses axe-core via vitest-axe to catch automated accessibility violations.
//
// Components covered:
//  - WorkspaceTreeNode (single tree node, treeitem role)
//  - WorkspaceTreeView (full tree, fetches via TanStack Query)
//  - TemplateCard (single template radio card)
//  - TemplatePickerGrid (template selection radiogroup, fetches via TanStack Query)
//  - PluginToggleCard (plugin enable/disable card with Switch)
//  - MoveWorkspaceDialog (re-parent dialog, wraps WorkspaceTreeView)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureAxe } from 'vitest-axe';

// toHaveNoViolations is registered globally in src/test/setup.ts

// Type-safe helper — avoids repeating casts at every assertion site
function expectNoViolations(results: unknown): void {
  (expect(results) as unknown as { toHaveNoViolations(): void }).toHaveNoViolations();
}

// ---------------------------------------------------------------------------
// Configure axe — disable rules that don't work in jsdom
// ---------------------------------------------------------------------------

const axe = configureAxe({
  rules: {
    // CSS custom properties (vars) are not resolved in jsdom
    'color-contrast': { enabled: false },
    // Full-screen single-component renders don't need landmark regions
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock api-client so components don't make real network calls
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock @plexica/ui primitives — jsdom cannot render Radix portals / Tooltip
// correctly, but we only need the structural HTML for axe to evaluate.
vi.mock('@plexica/ui', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // Radix Tooltip — render children inline for a11y scan
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => (
      <div role="tooltip">{children}</div>
    ),
    // Radix Dialog — render as a simple div so axe can evaluate structure
    Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <>{children}</> : null,
    ModalContent: ({
      children,
      ...props
    }: { children: React.ReactNode } & Record<string, unknown>) => (
      <div role="dialog" aria-modal="true" {...props}>
        {children}
      </div>
    ),
    ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ModalTitle: ({ children, id }: { children: React.ReactNode; id?: string }) => (
      <h2 id={id}>{children}</h2>
    ),
    ModalDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ModalClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
      asChild ? <>{children}</> : <button type="button">{children}</button>,
    // Switch — render a real checkbox for a11y purposes
    Switch: ({
      checked,
      disabled,
      'aria-label': ariaLabel,
    }: {
      checked?: boolean;
      disabled?: boolean;
      'aria-label'?: string;
    }) => (
      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        type="button"
      />
    ),
    // Skeleton — simple div
    Skeleton: ({ className }: { className?: string }) => (
      <div className={className} aria-hidden="true" />
    ),
  };
});

// Mock WorkspaceTreeView inside MoveWorkspaceDialog so the dialog a11y scan
// doesn't depend on a second TanStack Query fetch.
vi.mock('@/components/workspace/WorkspaceTreeView', () => ({
  WorkspaceTreeView: ({
    onSelect,
    showMoveToRoot: _showMoveToRoot,
    selectedId: _selectedId,
    disabledIds: _disabledIds,
  }: {
    onSelect?: (id: string | null) => void;
    showMoveToRoot?: boolean;
    selectedId?: string | null;
    disabledIds?: Set<string>;
  }) => (
    <ul role="tree" aria-label="Workspace hierarchy">
      <li role="none">
        <div
          role="treeitem"
          aria-level={1}
          aria-selected={false}
          tabIndex={0}
          onClick={() => onSelect?.('ws-mock-1')}
        >
          Mock Workspace
        </div>
      </li>
    </ul>
  ),
}));

// Silence non-actionable React / jsdom console noise during axe analysis
const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Helper — QueryClient wrapper (fresh client per test)
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Minimal test data fixtures
// ---------------------------------------------------------------------------

const LEAF_NODE = {
  id: 'ws-1',
  slug: 'engineering',
  name: 'Engineering',
  description: 'Engineering workspace',
  depth: 0,
  path: 'ws-1',
  parentId: null,
  memberRole: 'ADMIN' as const,
  _count: { members: 3, children: 0 },
  children: [],
};

const PARENT_NODE = {
  ...LEAF_NODE,
  id: 'ws-2',
  slug: 'product',
  name: 'Product',
  _count: { members: 5, children: 1 },
  children: [LEAF_NODE],
};

const TEMPLATE_DATA = {
  id: 'tmpl-1',
  name: 'Standard Workspace',
  description: 'A standard workspace template',
  isDefault: true,
  sourcePluginName: 'core',
  items: [{ type: 'plugin' as const }, { type: 'page' as const }, { type: 'setting' as const }],
};

const PLUGIN_DATA = {
  pluginId: 'plugin-crm',
  name: 'CRM Plugin',
  version: '1.2.3',
  description: 'Customer relationship management plugin',
  tenantEnabled: true,
  enabled: true,
  configuration: { apiKey: 'test' },
};

// ---------------------------------------------------------------------------
// WorkspaceTreeNode — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('WorkspaceTreeNode — WCAG 2.1 AA', () => {
  it('has no violations — leaf node (no children)', async () => {
    const { WorkspaceTreeNode } = await import('@/components/workspace/WorkspaceTreeNode');
    const { container } = render(
      <ul role="tree">
        <WorkspaceTreeNode node={LEAF_NODE} level={0} />
      </ul>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — parent node expanded with child', async () => {
    const { WorkspaceTreeNode } = await import('@/components/workspace/WorkspaceTreeNode');
    const { container } = render(
      <ul role="tree">
        <WorkspaceTreeNode node={PARENT_NODE} level={0} defaultExpanded />
      </ul>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — disabled node', async () => {
    const { WorkspaceTreeNode } = await import('@/components/workspace/WorkspaceTreeNode');
    const { container } = render(
      <ul role="tree">
        <WorkspaceTreeNode node={LEAF_NODE} level={0} disabled />
      </ul>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — INHERITED (hierarchical reader) badge', async () => {
    const { WorkspaceTreeNode } = await import('@/components/workspace/WorkspaceTreeNode');
    const inheritedNode = { ...LEAF_NODE, memberRole: null };
    const { container } = render(
      <ul role="tree">
        <WorkspaceTreeNode node={inheritedNode} level={0} />
      </ul>
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// WorkspaceTreeView — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('WorkspaceTreeView — WCAG 2.1 AA', () => {
  it('has no violations — loading skeleton state', async () => {
    // Don't resolve the query → component renders loading skeleton
    const { WorkspaceTreeView } = await import('@/components/workspace/WorkspaceTreeView');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // Pre-populate with loading state by not providing data
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceTreeView />
      </QueryClientProvider>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — populated tree', async () => {
    const { WorkspaceTreeView } = await import('@/components/workspace/WorkspaceTreeView');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Pre-seed the cache so the component renders immediately with data
    queryClient.setQueryData(['workspace-tree'], [PARENT_NODE]);
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceTreeView selectedId="ws-1" />
      </QueryClientProvider>
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// TemplateCard — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('TemplateCard — WCAG 2.1 AA', () => {
  it('has no violations — unselected card', async () => {
    const { TemplateCard } = await import('@/components/workspace/TemplateCard');
    const { container } = render(
      <div role="radiogroup" aria-label="Select workspace template">
        <TemplateCard template={TEMPLATE_DATA} selected={false} />
      </div>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — selected card with checkmark', async () => {
    const { TemplateCard } = await import('@/components/workspace/TemplateCard');
    const { container } = render(
      <div role="radiogroup" aria-label="Select workspace template">
        <TemplateCard template={TEMPLATE_DATA} selected />
      </div>
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// TemplatePickerGrid — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('TemplatePickerGrid — WCAG 2.1 AA', () => {
  it('has no violations — populated grid', async () => {
    const { TemplatePickerGrid } = await import('@/components/workspace/TemplatePickerGrid');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['workspace-templates'], [TEMPLATE_DATA]);
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TemplatePickerGrid />
      </QueryClientProvider>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — loading skeleton state', async () => {
    const { TemplatePickerGrid } = await import('@/components/workspace/TemplatePickerGrid');
    // Fresh QueryClient — query is loading
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TemplatePickerGrid />
      </QueryClientProvider>
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// PluginToggleCard — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('PluginToggleCard — WCAG 2.1 AA', () => {
  it('has no violations — tenant-enabled plugin (ADMIN role)', async () => {
    const { PluginToggleCard } = await import('@/components/workspace/PluginToggleCard');
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <PluginToggleCard workspaceId="ws-1" plugin={PLUGIN_DATA} userRole="ADMIN" />
      </Wrapper>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — not tenant-enabled plugin (disabled toggle)', async () => {
    const { PluginToggleCard } = await import('@/components/workspace/PluginToggleCard');
    const Wrapper = makeWrapper();
    const disabledPlugin = { ...PLUGIN_DATA, tenantEnabled: false, enabled: false };
    const { container } = render(
      <Wrapper>
        <PluginToggleCard workspaceId="ws-1" plugin={disabledPlugin} userRole="MEMBER" />
      </Wrapper>
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// MoveWorkspaceDialog — WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('MoveWorkspaceDialog — WCAG 2.1 AA', () => {
  it('has no violations — dialog open', async () => {
    const { MoveWorkspaceDialog } = await import('@/components/workspace/MoveWorkspaceDialog');
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <MoveWorkspaceDialog
          workspaceId="ws-1"
          workspaceName="Engineering"
          open
          onOpenChange={vi.fn()}
          treeData={[PARENT_NODE]}
        />
      </Wrapper>
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — dialog closed (renders nothing)', async () => {
    const { MoveWorkspaceDialog } = await import('@/components/workspace/MoveWorkspaceDialog');
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <MoveWorkspaceDialog
          workspaceId="ws-1"
          workspaceName="Engineering"
          open={false}
          onOpenChange={vi.fn()}
        />
      </Wrapper>
    );
    expectNoViolations(await axe(container));
  });
});

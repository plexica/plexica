// File: apps/super-admin/src/__tests__/components/plugins/PluginCard.test.tsx
//
// Unit tests for the PluginCard component.
// Covers: correct primary/secondary action rendering per lifecycle status,
// Radix DropdownMenu behaviour, ARIA attributes, focus-visible ring on name button.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from '@/components/plugins/PluginCard';
import type { Plugin } from '@/types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'p1',
    name: 'Test Plugin',
    version: '1.2.3',
    description: 'A test plugin description',
    author: 'Plexica',
    category: 'analytics',
    status: 'PUBLISHED',
    lifecycleStatus: 'REGISTERED',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeHandlers() {
  return {
    onView: vi.fn(),
    onInstall: vi.fn(),
    onEnable: vi.fn(),
    onDisable: vi.fn(),
    onUpdate: vi.fn(),
    onUninstall: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginCard', () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    handlers = makeHandlers();
  });

  // --- ARIA + structure ---

  it('should render as article with aria-label', () => {
    render(<PluginCard plugin={makePlugin()} {...handlers} />);
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(article).toHaveAttribute('aria-label', expect.stringContaining('Test Plugin'));
  });

  it('should display plugin name, version, category, description', () => {
    render(<PluginCard plugin={makePlugin()} {...handlers} />);
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
    expect(screen.getByText(/analytics/)).toBeInTheDocument();
    expect(screen.getByText('A test plugin description')).toBeInTheDocument();
  });

  it('should display plugin icon when provided', () => {
    render(<PluginCard plugin={makePlugin({ icon: '🚀' })} {...handlers} />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
  });

  it('should display default icon when icon is not provided', () => {
    render(<PluginCard plugin={makePlugin({ icon: undefined })} {...handlers} />);
    expect(screen.getByText('🧩')).toBeInTheDocument();
  });

  it('should show tenant count when provided', () => {
    render(<PluginCard plugin={makePlugin({ tenantCount: 5 })} {...handlers} />);
    expect(screen.getByText(/5 tenants/)).toBeInTheDocument();
  });

  it('should show "1 tenant" (singular) when tenantCount is 1', () => {
    render(<PluginCard plugin={makePlugin({ tenantCount: 1 })} {...handlers} />);
    expect(screen.getByText(/1 tenant/)).toBeInTheDocument();
  });

  it('should show Healthy indicator only when ACTIVE', () => {
    const { rerender } = render(
      <PluginCard plugin={makePlugin({ lifecycleStatus: 'ACTIVE' })} {...handlers} />
    );
    expect(screen.getByText('Healthy')).toBeInTheDocument();

    rerender(<PluginCard plugin={makePlugin({ lifecycleStatus: 'INSTALLED' })} {...handlers} />);
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  // --- Plugin name button focus-visible (MEDIUM #7) ---

  it('plugin name button should have focus-visible ring class', () => {
    render(<PluginCard plugin={makePlugin()} {...handlers} />);
    const nameBtn = screen.getByRole('button', { name: 'Test Plugin' });
    expect(nameBtn.className).toContain('focus-visible:ring-2');
  });

  it('clicking plugin name button should call onView', () => {
    const plugin = makePlugin();
    render(<PluginCard plugin={plugin} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test Plugin' }));
    expect(handlers.onView).toHaveBeenCalledWith(plugin);
  });

  // --- REGISTERED: Install + View ---

  it('REGISTERED: should show Install (primary) and View (secondary) buttons', () => {
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'REGISTERED' })} {...handlers} />);
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBeGreaterThanOrEqual(1);
  });

  it('REGISTERED: clicking Install should call onInstall', () => {
    const plugin = makePlugin({ lifecycleStatus: 'REGISTERED' });
    render(<PluginCard plugin={plugin} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(handlers.onInstall).toHaveBeenCalledWith(plugin);
  });

  // --- INSTALLED: Enable + View ---

  it('INSTALLED: should show Enable (primary) and View (secondary) buttons', () => {
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'INSTALLED' })} {...handlers} />);
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBeGreaterThanOrEqual(1);
  });

  it('INSTALLED: clicking Enable should call onEnable', () => {
    const plugin = makePlugin({ lifecycleStatus: 'INSTALLED' });
    render(<PluginCard plugin={plugin} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    expect(handlers.onEnable).toHaveBeenCalledWith(plugin);
  });

  // --- ACTIVE: View (primary) + ActionMenu ---

  it('ACTIVE: should show View (primary) and More actions (secondary) buttons', () => {
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'ACTIVE' })} {...handlers} />);
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('ACTIVE: More actions menu opens and contains Disable, Update, Uninstall', async () => {
    const user = userEvent.setup();
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'ACTIVE' })} {...handlers} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('Disable')).toBeInTheDocument();
    expect(screen.getByText('Update')).toBeInTheDocument();
    expect(screen.getByText('Uninstall')).toBeInTheDocument();
  });

  it('ACTIVE: clicking Disable in menu should call onDisable', async () => {
    const user = userEvent.setup();
    const plugin = makePlugin({ lifecycleStatus: 'ACTIVE' });
    render(<PluginCard plugin={plugin} {...handlers} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByText('Disable'));
    expect(handlers.onDisable).toHaveBeenCalledWith(plugin);
  });

  it('ACTIVE: clicking Uninstall in menu should call onUninstall', async () => {
    const user = userEvent.setup();
    const plugin = makePlugin({ lifecycleStatus: 'ACTIVE' });
    render(<PluginCard plugin={plugin} {...handlers} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByText('Uninstall'));
    expect(handlers.onUninstall).toHaveBeenCalledWith(plugin);
  });

  // --- DISABLED: View (primary) + ActionMenu ---

  it('DISABLED: should show View (primary) and More actions (secondary) buttons', () => {
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'DISABLED' })} {...handlers} />);
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('DISABLED: More actions menu contains Enable and Uninstall', async () => {
    const user = userEvent.setup();
    render(<PluginCard plugin={makePlugin({ lifecycleStatus: 'DISABLED' })} {...handlers} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('Enable')).toBeInTheDocument();
    expect(screen.getByText('Uninstall')).toBeInTheDocument();
  });

  // --- In-progress statuses: View only ---

  it.each(['INSTALLING', 'UNINSTALLING', 'UNINSTALLED'] as const)(
    '%s: should only show View button and no secondary action',
    (status) => {
      render(<PluginCard plugin={makePlugin({ lifecycleStatus: status })} {...handlers} />);
      expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
    }
  );
});

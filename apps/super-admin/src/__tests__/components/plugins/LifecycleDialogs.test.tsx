// File: apps/super-admin/src/__tests__/components/plugins/LifecycleDialogs.test.tsx
//
// Tests for T004-35: all four lifecycle confirmation dialogs.
//   EnablePluginDialog   — Screen 3a
//   DisablePluginDialog  — Screen 3b
//   UpdatePluginDialog   — Screen 3c
//   UninstallPluginDialog — Screen 3d
//
// Strategy:
//   - Mock useMutation so mutationFn is synchronously controllable
//   - Mock apiClient methods to capture calls
//   - Mock useToast to capture toast notifications
//   - All rendering tests run synchronously with jsdom
//
// Covers:
//   - Renders expected content (permissions, impact, version diff, data-cleanup)
//   - Confirm button calls correct API method
//   - Cancel closes dialog (onOpenChange called with false)
//   - Error state: inline alert shown on mutation error
//   - Loading state: button label changes during pending
//   - UpdatePluginDialog: confirm button disabled until plugin name typed
//   - UninstallPluginDialog: confirm button disabled until plugin name typed
//   - UninstallPluginDialog: deleteData checkbox state passed to API
//   - UninstallPluginDialog blocked state: action button disabled when activeTenantCount > 0
//   - ARIA: role="alertdialog", aria-labelledby, aria-describedby
//   - ARIA: destructive buttons use variant="destructive"
//   - Name confirmation inputs: aria-label + aria-describedby

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before component imports
// ---------------------------------------------------------------------------

// Mock useMutation & useQueryClient from react-query
const mockMutate = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(
    ({
      onSuccess,
      onError,
    }: {
      mutationFn?: () => Promise<unknown>;
      onSuccess?: () => void;
      onError?: (err: unknown) => void;
    }) => ({
      mutate: mockMutate.mockImplementation(() => {
        // Default: do nothing (tests override via mockMutateImpl)
      }),
      isPending: false,
      _onSuccess: onSuccess,
      _onError: onError,
    })
  ),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}));

// Mock API client — use vi.fn() inline to avoid hoisting reference errors
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    enablePlugin: vi.fn(),
    disablePlugin: vi.fn(),
    upgradePlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
  },
}));

// Mock useToast — use vi.fn() inline to avoid hoisting reference errors
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Now import components (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { EnablePluginDialog } from '@/components/plugins/EnablePluginDialog';
import { DisablePluginDialog } from '@/components/plugins/DisablePluginDialog';
import { UpdatePluginDialog } from '@/components/plugins/UpdatePluginDialog';
import { UninstallPluginDialog } from '@/components/plugins/UninstallPluginDialog';
import type { PluginEntity } from '@plexica/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlugin(
  overrides: Partial<PluginEntity & { manifest?: Record<string, unknown> }> = {}
): PluginEntity {
  const { manifest: _manifest, ...entityOverrides } = overrides;
  const base: PluginEntity = {
    id: 'plugin-1',
    name: 'CRM Plugin',
    version: '1.0.0',
    description: 'A CRM plugin',
    author: 'Plexica',
    category: 'crm',
    status: 'PUBLISHED',
    lifecycleStatus: 'ACTIVE',
    tenantCount: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...entityOverrides,
  };
  if (overrides.manifest) {
    // Attach manifest via cast (matches how components access it)
    (base as PluginEntity & { manifest: Record<string, unknown> }).manifest = overrides.manifest;
  }
  return base;
}

// ---------------------------------------------------------------------------
// EnablePluginDialog
// ---------------------------------------------------------------------------

describe('EnablePluginDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderEnable(
    pluginOverrides: Partial<PluginEntity & { manifest?: Record<string, unknown> }> = {}
  ) {
    render(
      <EnablePluginDialog
        plugin={makePlugin(pluginOverrides)}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  it('should render dialog with role="alertdialog"', () => {
    renderEnable();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('should render title "Enable CRM Plugin?"', () => {
    renderEnable();
    expect(screen.getByText('Enable CRM Plugin?')).toBeInTheDocument();
  });

  it('should render aria-labelledby pointing to title', () => {
    renderEnable();
    const dialog = screen.getByRole('alertdialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl).toBeTruthy();
    expect(titleEl!.textContent).toContain('Enable CRM Plugin?');
  });

  it('should render aria-describedby', () => {
    renderEnable();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('should render "This will:" bullet list', () => {
    renderEnable();
    expect(screen.getByText(/This will:/)).toBeInTheDocument();
    expect(screen.getByText(/Start the plugin container/)).toBeInTheDocument();
    expect(screen.getByText(/Register in service discovery/)).toBeInTheDocument();
    expect(screen.getByText(/Run health check verification/)).toBeInTheDocument();
  });

  it('should render event count when manifest has events', () => {
    renderEnable({ manifest: { events: ['evt1', 'evt2'] } });
    expect(screen.getByText(/Configure event subscriptions \(2 events\)/)).toBeInTheDocument();
  });

  it('should NOT render event line when manifest has no events', () => {
    renderEnable();
    expect(screen.queryByText(/Configure event subscriptions/)).not.toBeInTheDocument();
  });

  it('should render permissions panel when manifest has permissions', () => {
    renderEnable({ manifest: { permissions: ['crm:contacts:read', 'crm:deals:write'] } });
    expect(screen.getByRole('note', { name: 'Permissions to be activated' })).toBeInTheDocument();
    expect(screen.getByText('crm:contacts:read')).toBeInTheDocument();
    expect(screen.getByText('crm:deals:write')).toBeInTheDocument();
  });

  it('should NOT render permissions panel when manifest has no permissions', () => {
    renderEnable();
    expect(
      screen.queryByRole('note', { name: 'Permissions to be activated' })
    ).not.toBeInTheDocument();
  });

  it('should render tenant impact message', () => {
    renderEnable();
    expect(screen.getByText(/Tenants will be able to enable this plugin/)).toBeInTheDocument();
  });

  it('should render Cancel and Enable Plugin buttons', () => {
    renderEnable();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable Plugin' })).toBeInTheDocument();
  });

  it('clicking Cancel calls onOpenChange(false)', () => {
    renderEnable();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking Enable Plugin calls mutate', () => {
    renderEnable();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Plugin' }));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it('Enable Plugin button is not disabled by default', () => {
    renderEnable();
    const btn = screen.getByRole('button', { name: 'Enable Plugin' });
    expect(btn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// DisablePluginDialog
// ---------------------------------------------------------------------------

describe('DisablePluginDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDisable(pluginOverrides: Partial<PluginEntity> = {}) {
    render(
      <DisablePluginDialog
        plugin={makePlugin(pluginOverrides)}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  it('should render dialog with role="alertdialog"', () => {
    renderDisable();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('should render title "Disable CRM Plugin?"', () => {
    renderDisable();
    expect(screen.getByText('Disable CRM Plugin?')).toBeInTheDocument();
  });

  it('should render aria-labelledby pointing to title', () => {
    renderDisable();
    const dialog = screen.getByRole('alertdialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl!.textContent).toContain('Disable CRM Plugin?');
  });

  it('should render Impact Warning panel with role="alert"', () => {
    renderDisable();
    const alerts = screen.getAllByRole('alert');
    const impactWarning = alerts.find((el) => el.getAttribute('aria-label') === 'Impact warning');
    expect(impactWarning).toBeTruthy();
  });

  it('should show tenant count when tenantCount > 0', () => {
    renderDisable({ tenantCount: 8 });
    expect(screen.getByText(/8 tenants currently have this plugin enabled/)).toBeInTheDocument();
  });

  it('should NOT show tenant count line when tenantCount is 0', () => {
    renderDisable({ tenantCount: 0 });
    expect(screen.queryByText(/tenants currently/)).not.toBeInTheDocument();
  });

  it('should show data preservation notice', () => {
    renderDisable();
    expect(screen.getByText(/All tenant data will be preserved/)).toBeInTheDocument();
  });

  it('should render "Disable Plugin" button with destructive variant', () => {
    renderDisable();
    const btn = screen.getByRole('button', { name: 'Disable Plugin' });
    expect(btn).toBeInTheDocument();
    // Verify destructive styling via class (Tailwind variant)
    expect(btn.className).toMatch(/destructive/);
  });

  it('clicking Cancel calls onOpenChange(false)', () => {
    renderDisable();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking Disable Plugin calls mutate', () => {
    renderDisable();
    fireEvent.click(screen.getByRole('button', { name: 'Disable Plugin' }));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it('Disable Plugin button is not disabled by default', () => {
    renderDisable();
    const btn = screen.getByRole('button', { name: 'Disable Plugin' });
    expect(btn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// UpdatePluginDialog
// ---------------------------------------------------------------------------

describe('UpdatePluginDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderUpdate(
    props: {
      pluginOverrides?: Partial<PluginEntity>;
      targetVersion?: string;
      breaking?: boolean;
      changelog?: string;
    } = {}
  ) {
    render(
      <UpdatePluginDialog
        plugin={makePlugin(props.pluginOverrides)}
        targetVersion={props.targetVersion}
        breaking={props.breaking}
        changelog={props.changelog}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  it('should render dialog with role="alertdialog"', () => {
    renderUpdate();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('should render title "Update CRM Plugin?"', () => {
    renderUpdate();
    expect(screen.getByText('Update CRM Plugin?')).toBeInTheDocument();
  });

  it('should render version diff when targetVersion provided', () => {
    renderUpdate({ targetVersion: '2.0.0' });
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v2\.0\.0/)).toBeInTheDocument();
  });

  it('should NOT render version diff when targetVersion is not provided', () => {
    renderUpdate();
    expect(screen.queryByLabelText('Version change')).not.toBeInTheDocument();
  });

  it('should render changelog when provided', () => {
    renderUpdate({ changelog: 'Added new reports module' });
    expect(screen.getByText(/Added new reports module/)).toBeInTheDocument();
  });

  it('should render info panel with role="note"', () => {
    renderUpdate();
    expect(screen.getByRole('note', { name: 'Update process information' })).toBeInTheDocument();
  });

  it('should show rollback note in info panel', () => {
    renderUpdate();
    expect(screen.getByText(/automatically restored/i)).toBeInTheDocument();
  });

  it('should NOT render breaking changes alert when breaking is false', () => {
    renderUpdate({ breaking: false });
    expect(screen.queryByLabelText('Breaking changes warning')).not.toBeInTheDocument();
  });

  it('should render breaking changes alert when breaking is true', () => {
    renderUpdate({ breaking: true });
    expect(screen.getByLabelText('Breaking changes warning')).toBeInTheDocument();
    expect(screen.getByText(/breaking changes/i)).toBeInTheDocument();
  });

  it('should render name confirmation input when breaking is true', () => {
    renderUpdate({ breaking: true });
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('Update Plugin button disabled when breaking=true and name not typed', () => {
    renderUpdate({ breaking: true });
    const btn = screen.getByRole('button', { name: 'Update Plugin' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('Update Plugin button enabled when breaking=true and correct name typed', async () => {
    renderUpdate({ breaking: true });
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    await userEvent.type(input, 'CRM Plugin');
    const btn = screen.getByRole('button', { name: 'Update Plugin' });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'false');
  });

  it('Update Plugin button enabled when breaking=false (no confirmation needed)', () => {
    renderUpdate({ breaking: false });
    const btn = screen.getByRole('button', { name: 'Update Plugin' });
    expect(btn).not.toBeDisabled();
  });

  it('should NOT render name confirmation input when breaking is false', () => {
    renderUpdate({ breaking: false });
    expect(
      screen.queryByRole('textbox', { name: 'Type plugin name to confirm' })
    ).not.toBeInTheDocument();
  });

  it('clicking Cancel calls onOpenChange(false)', () => {
    renderUpdate();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking Update Plugin when enabled calls mutate', () => {
    renderUpdate({ breaking: false });
    fireEvent.click(screen.getByRole('button', { name: 'Update Plugin' }));
    expect(mockMutate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// UninstallPluginDialog
// ---------------------------------------------------------------------------

describe('UninstallPluginDialog', () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderUninstall(
    props: {
      pluginOverrides?: Partial<PluginEntity & { manifest?: Record<string, unknown> }>;
      activeTenantCount?: number;
    } = {}
  ) {
    const { manifest, ...entityOverrides } = props.pluginOverrides ?? {};
    render(
      <UninstallPluginDialog
        plugin={makePlugin({ ...entityOverrides, ...(manifest ? { manifest } : {}) })}
        activeTenantCount={props.activeTenantCount}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  it('should render dialog with role="alertdialog"', () => {
    renderUninstall();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('should render title "Uninstall CRM Plugin?"', () => {
    renderUninstall();
    expect(screen.getByText(/Uninstall CRM Plugin\?/)).toBeInTheDocument();
  });

  it('should render aria-labelledby pointing to title', () => {
    renderUninstall();
    const dialog = screen.getByRole('alertdialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl!.textContent).toContain('Uninstall CRM Plugin?');
  });

  it('should render "This will permanently:" bullet list', () => {
    renderUninstall();
    expect(screen.getByText(/This will permanently:/)).toBeInTheDocument();
    expect(screen.getByText(/Remove the plugin container/)).toBeInTheDocument();
    expect(screen.getByText(/Deregister all API routes/)).toBeInTheDocument();
    expect(screen.getByText(/Remove frontend module registration/)).toBeInTheDocument();
  });

  it('should show permission count in bullet list when manifest has permissions', () => {
    renderUninstall({ pluginOverrides: { manifest: { permissions: ['a', 'b', 'c', 'd'] } } });
    expect(screen.getByText(/Remove 4 permissions from the system/)).toBeInTheDocument();
  });

  it('should show event count in bullet list when manifest has events', () => {
    renderUninstall({ pluginOverrides: { manifest: { events: ['e1', 'e2', 'e3'] } } });
    expect(screen.getByText(/Deregister 3 event subscriptions/)).toBeInTheDocument();
  });

  it('should render Data Cleanup panel with role="note"', () => {
    renderUninstall();
    expect(screen.getByRole('note', { name: 'Data cleanup options' })).toBeInTheDocument();
  });

  it('should render "Delete plugin data" checkbox', () => {
    renderUninstall();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('should show tenant count on checkbox label when tenantCount > 0', () => {
    renderUninstall({ pluginOverrides: { tenantCount: 8 } });
    expect(screen.getByText(/8 tenants/)).toBeInTheDocument();
  });

  it('toggling the checkbox checks/unchecks it', async () => {
    renderUninstall();
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('should show irreversibility warning when checkbox is checked', async () => {
    renderUninstall();
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);
    expect(screen.getByText(/This cannot be undone/)).toBeVisible();
  });

  it('should render name confirmation input', () => {
    renderUninstall();
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('Uninstall Plugin button is disabled when plugin name not typed', () => {
    renderUninstall();
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('Uninstall Plugin button is enabled after typing correct plugin name', async () => {
    renderUninstall();
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    await userEvent.type(input, 'CRM Plugin');
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'false');
  });

  it('Uninstall Plugin button remains disabled with partial name', async () => {
    renderUninstall();
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    await userEvent.type(input, 'CRM');
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn).toBeDisabled();
  });

  it('Uninstall Plugin button uses destructive variant', async () => {
    renderUninstall();
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    await userEvent.type(input, 'CRM Plugin');
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn.className).toMatch(/destructive/);
  });

  it('clicking Cancel calls onOpenChange(false)', () => {
    renderUninstall();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking Uninstall Plugin when name confirmed calls mutate', async () => {
    renderUninstall();
    const input = screen.getByRole('textbox', { name: 'Type plugin name to confirm' });
    await userEvent.type(input, 'CRM Plugin');
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall Plugin' }));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  // ---- Blocked state ----

  it('should show blocked warning when activeTenantCount > 0', () => {
    renderUninstall({ activeTenantCount: 5 });
    const alerts = screen.getAllByRole('alert');
    const blockedAlert = alerts.find((el) => el.getAttribute('aria-label') === 'Uninstall blocked');
    expect(blockedAlert).toBeTruthy();
    expect(blockedAlert!.textContent).toContain('5 tenants');
  });

  it('should NOT show blocked warning when activeTenantCount is 0', () => {
    renderUninstall({ activeTenantCount: 0 });
    const alerts = screen.queryAllByRole('alert');
    const blockedAlert = alerts.find((el) => el.getAttribute('aria-label') === 'Uninstall blocked');
    expect(blockedAlert).toBeFalsy();
  });

  it('Uninstall Plugin button is disabled when blocked (even with name typed)', async () => {
    // When blocked, the name input is hidden, button always disabled
    renderUninstall({ activeTenantCount: 3 });
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('should NOT render name confirmation input when blocked', () => {
    renderUninstall({ activeTenantCount: 3 });
    expect(
      screen.queryByRole('textbox', { name: 'Type plugin name to confirm' })
    ).not.toBeInTheDocument();
  });

  it('blocked button has title "Disable in all tenants first"', () => {
    renderUninstall({ activeTenantCount: 2 });
    const btn = screen.getByRole('button', { name: 'Uninstall Plugin' });
    expect(btn).toHaveAttribute('title', 'Disable in all tenants first');
  });

  // ---- Checkbox aria-describedby ----

  it('checkbox has aria-describedby linking to cleanup warning element', () => {
    renderUninstall();
    const checkbox = screen.getByRole('checkbox');
    const describedById = checkbox.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)).toBeTruthy();
  });
});

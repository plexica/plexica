// apps/web/src/__tests__/workspace/unit/T8-components.test.tsx
//
// T8 unit tests covering the 5 new workspace components:
//  - SharingDisabledEmptyState
//  - SharedResourceRow
//  - RevokeShareDialog
//  - WorkspaceSettingsForm
//  - SharePluginDialog (basic render + selection)
//  - SharedResourcesList
//  - WorkspaceSwitcher
//
// Constitution Art. 8.1 — unit tests for all business logic/UI components.
// Constitution Art. 8.2 — deterministic, independent, AAA pattern.

import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-dropdown-menu so DropdownMenuContent Portal renders inline
// (same pattern as dialog mock above — required for WorkspaceSwitcher tests)
// ---------------------------------------------------------------------------

vi.mock('@radix-ui/react-dropdown-menu', async () => {
  const actual = await vi.importActual<typeof import('@radix-ui/react-dropdown-menu')>(
    '@radix-ui/react-dropdown-menu'
  );
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ---------------------------------------------------------------------------
// Mock @plexica/ui DropdownMenu components so content renders inline in jsdom
// (Radix DropdownMenuContent is gated by open state + Portal — both must be bypassed)
// ---------------------------------------------------------------------------

vi.mock('@plexica/ui', async () => {
  const actual = await vi.importActual<typeof import('@plexica/ui')>('@plexica/ui');
  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) => (asChild ? <>{children}</> : <div>{children}</div>),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
    }) => <div onClick={onClick}>{children}</div>,
  };
});

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-dropdown-menu so DropdownMenuContent Portal renders inline
// (same pattern as dialog mock above — required for WorkspaceSwitcher tests)
// ---------------------------------------------------------------------------

vi.mock('@radix-ui/react-dropdown-menu', async () => {
  const actual = await vi.importActual<typeof import('@radix-ui/react-dropdown-menu')>(
    '@radix-ui/react-dropdown-menu'
  );
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/api-client so WorkspaceSettingsForm does not hit the network
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: vi.fn().mockResolvedValue({}),
    patchWorkspaceSettings: vi.fn().mockResolvedValue({
      defaultTeamRole: 'MEMBER',
      allowCrossWorkspaceSharing: false,
      maxMembers: 0,
      isDiscoverable: true,
    }),
    getWorkspaceResources: vi.fn().mockResolvedValue([]),
    shareWorkspaceResource: vi.fn().mockResolvedValue(undefined),
    revokeWorkspaceResource: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Mock @tanstack/react-query for SharedResourcesList and WorkspaceSwitcher
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock @/contexts/WorkspaceContext for WorkspaceSwitcher tests
// ---------------------------------------------------------------------------

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Component imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { SharingDisabledEmptyState } from '@/components/workspace/SharingDisabledEmptyState';
import { SharedResourceRow } from '@/components/workspace/SharedResourceRow';
import type { SharedResource } from '@/components/workspace/SharedResourceRow';
import { RevokeShareDialog } from '@/components/workspace/RevokeShareDialog';
import { WorkspaceSettingsForm } from '@/components/workspace/WorkspaceSettingsForm';
import { SharePluginDialog } from '@/components/workspace/SharePluginDialog';
import { SharedResourcesList } from '@/components/workspace/SharedResourcesList';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useQuery, useMutation } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockResource: SharedResource = {
  id: 'res-1',
  resourceType: 'PLUGIN',
  resourceId: 'plugin-1',
  resourceName: 'My Plugin',
  sharedWithWorkspaceName: 'Target WS',
  sharedByEmail: 'admin@example.com',
  sharedAt: '2026-01-15T12:00:00Z',
};

const defaultSettings = {
  defaultTeamRole: 'MEMBER' as const,
  allowCrossWorkspaceSharing: false,
  maxMembers: 0,
  isDiscoverable: true,
};

// ---------------------------------------------------------------------------
// 1. SharingDisabledEmptyState
// ---------------------------------------------------------------------------

describe('SharingDisabledEmptyState', () => {
  it('renders the heading and description', () => {
    render(<SharingDisabledEmptyState onGoToSettings={vi.fn()} />);
    expect(screen.getByText('Cross-Workspace Sharing is Disabled')).toBeInTheDocument();
    expect(screen.getByText(/Resource sharing must be enabled/i)).toBeInTheDocument();
  });

  it('renders "Go to Settings" button', () => {
    render(<SharingDisabledEmptyState onGoToSettings={vi.fn()} />);
    expect(screen.getByRole('button', { name: /go to settings/i })).toBeInTheDocument();
  });

  it('calls onGoToSettings when button is clicked', () => {
    const onGoToSettings = vi.fn();
    render(<SharingDisabledEmptyState onGoToSettings={onGoToSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /go to settings/i }));
    expect(onGoToSettings).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. SharedResourceRow
// ---------------------------------------------------------------------------

describe('SharedResourceRow', () => {
  it('renders the resource name', () => {
    render(
      <SharedResourceRow
        resource={mockResource}
        isOutbound={true}
        canRevoke={false}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByText('My Plugin')).toBeInTheDocument();
  });

  it('shows "Shared with" label for outbound rows', () => {
    render(
      <SharedResourceRow
        resource={mockResource}
        isOutbound={true}
        canRevoke={false}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByText(/Shared with/i)).toBeInTheDocument();
    expect(screen.getByText('Target WS')).toBeInTheDocument();
  });

  it('shows "Shared from" label for inbound rows', () => {
    const inbound: SharedResource = {
      ...mockResource,
      sharedWithWorkspaceName: undefined,
      sharedFromWorkspaceName: 'Source WS',
    };
    render(
      <SharedResourceRow
        resource={inbound}
        isOutbound={false}
        canRevoke={false}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByText(/Shared from/i)).toBeInTheDocument();
    expect(screen.getByText('Source WS')).toBeInTheDocument();
  });

  it('shows Revoke button when canRevoke=true', () => {
    render(
      <SharedResourceRow
        resource={mockResource}
        isOutbound={true}
        canRevoke={true}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /revoke access to my plugin/i })).toBeInTheDocument();
  });

  it('hides Revoke button when canRevoke=false', () => {
    render(
      <SharedResourceRow
        resource={mockResource}
        isOutbound={true}
        canRevoke={false}
        onRevoke={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });

  it('calls onRevoke with the resource when Revoke is clicked', () => {
    const onRevoke = vi.fn();
    render(
      <SharedResourceRow
        resource={mockResource}
        isOutbound={true}
        canRevoke={true}
        onRevoke={onRevoke}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /revoke access to my plugin/i }));
    expect(onRevoke).toHaveBeenCalledWith(mockResource);
  });
});

// ---------------------------------------------------------------------------
// 3. RevokeShareDialog
// ---------------------------------------------------------------------------

describe('RevokeShareDialog', () => {
  it('renders title and resource/workspace names when open', () => {
    render(
      <RevokeShareDialog
        open={true}
        resource={mockResource}
        targetWorkspaceName="Target WS"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Revoke Sharing')).toBeInTheDocument();
    expect(screen.getByText(/My Plugin/i)).toBeInTheDocument();
    expect(screen.getAllByText('Target WS').length).toBeGreaterThan(0);
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <RevokeShareDialog
        open={true}
        resource={mockResource}
        targetWorkspaceName="Target WS"
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when "Revoke Access" is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <RevokeShareDialog
        open={true}
        resource={mockResource}
        targetWorkspaceName="Target WS"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /revoke access/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows error message when error prop provided', () => {
    render(
      <RevokeShareDialog
        open={true}
        resource={mockResource}
        targetWorkspaceName="Target WS"
        error="Network error"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('disables buttons and shows spinner when isLoading=true', () => {
    render(
      <RevokeShareDialog
        open={true}
        resource={mockResource}
        targetWorkspaceName="Target WS"
        isLoading={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    // Revoke button is disabled when loading
    const revokeBtn = screen.getByRole('button', { name: /revoking/i });
    expect(revokeBtn).toBeDisabled();
  });

  it('renders nothing when resource is null', () => {
    const { container } = render(
      <RevokeShareDialog
        open={true}
        resource={null}
        targetWorkspaceName=""
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. WorkspaceSettingsForm
// ---------------------------------------------------------------------------

describe('WorkspaceSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 settings fields', () => {
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('Default Team Member Role')).toBeInTheDocument();
    expect(screen.getByText('Allow Cross-Workspace Sharing')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum Members')).toBeInTheDocument();
    expect(screen.getByText('Workspace Discoverable')).toBeInTheDocument();
    // notificationsEnabled must NOT be present
    expect(screen.queryByText('Workspace Notifications')).not.toBeInTheDocument();
  });

  it('Save and Discard buttons are visible for ADMIN', () => {
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('Save and Discard buttons are not rendered for non-admin', () => {
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={false} />
    );
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
  });

  it('Save button is disabled when there are no changes', () => {
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  it('shows "unsaved changes" indicator when settings are modified', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    // Toggle allowCrossWorkspaceSharing switch
    const sharingToggle = screen.getByRole('switch', { name: /allow cross-workspace sharing/i });
    await user.click(sharingToggle);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('maxMembers input validation shows error for negative value', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    const maxMembersInput = screen.getByLabelText('Maximum Members');
    await user.clear(maxMembersInput);
    await user.type(maxMembersInput, '-1');
    // Trigger blur to run validation
    fireEvent.blur(maxMembersInput);
    expect(screen.getByText(/too small: expected number to be >=0/i)).toBeInTheDocument();
  });

  it('calls apiClient.patchWorkspaceSettings on save and shows success message', async () => {
    const { apiClient: mockApiClient } = await import('@/lib/api-client');
    const patchSpy = vi.spyOn(mockApiClient, 'patchWorkspaceSettings').mockResolvedValue({
      defaultTeamRole: 'ADMIN',
      allowCrossWorkspaceSharing: true,
      maxMembers: 10,
      isDiscoverable: false,
    });
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    // Make a change to enable Save
    await user.click(screen.getByRole('switch', { name: /allow cross-workspace sharing/i }));
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          allowCrossWorkspaceSharing: true,
        })
      );
      expect(screen.getByText(/workspace settings saved/i)).toBeInTheDocument();
    });
  });

  it('shows error message when patchWorkspaceSettings fails', async () => {
    const { apiClient: mockApiClient } = await import('@/lib/api-client');
    vi.spyOn(mockApiClient, 'patchWorkspaceSettings').mockRejectedValue({
      response: { data: { error: { message: 'Server error' } } },
    });
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    await user.click(screen.getByRole('switch', { name: /allow cross-workspace sharing/i }));
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. SharePluginDialog
// ---------------------------------------------------------------------------

describe('SharePluginDialog', () => {
  const plugins = [
    { id: 'p-1', name: 'Analytics' },
    { id: 'p-2', name: 'Billing' },
  ];
  const workspaces = [
    { id: 'ws-a', name: 'Team Alpha' },
    { id: 'ws-b', name: 'Team Beta' },
  ];

  it('renders the dialog title when open', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByText('Share Plugin')).toBeInTheDocument();
  });

  it('lists all plugins', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('Share button is disabled when nothing is selected', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /share selected/i })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={onClose}
        onShare={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error message when error prop is provided', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error="Something went wrong"
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('enables Share button after selecting a plugin and a workspace', async () => {
    const user = userEvent.setup();
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    // Check first plugin checkbox
    const analyticsCheckbox = screen.getByRole('checkbox', { name: /analytics/i });
    await user.click(analyticsCheckbox);

    // Check first workspace checkbox
    const alphaCheckbox = screen.getByRole('checkbox', { name: /team alpha/i });
    await user.click(alphaCheckbox);

    expect(screen.getByRole('button', { name: /share selected/i })).not.toBeDisabled();
  });

  it('calls onShare with selected plugin and workspace ids', async () => {
    const user = userEvent.setup();
    const onShare = vi.fn().mockResolvedValue(undefined);
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={onShare}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: /analytics/i }));
    await user.click(screen.getByRole('checkbox', { name: /team alpha/i }));
    await user.click(screen.getByRole('button', { name: /share selected/i }));

    await waitFor(() => {
      expect(onShare).toHaveBeenCalledWith(['p-1'], ['ws-a']);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. SharedResourcesList
// ---------------------------------------------------------------------------

describe('SharedResourcesList', () => {
  const mockRevokeMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockRevokeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
  });

  it('shows SharingDisabledEmptyState when sharingEnabled=false', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={false}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.getByText(/Cross-Workspace Sharing is Disabled/i)).toBeInTheDocument();
  });

  it('shows loading skeletons when isLoading=true', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: true } as unknown as ReturnType<
      typeof useQuery
    >);
    const { container } = render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    // Skeleton elements are rendered (Skeleton component uses animate-pulse class)
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('shows Share Plugin button for admins when sharing enabled', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /share plugin/i })).toBeInTheDocument();
  });

  it('hides Share Plugin button for non-admins', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={false}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /share plugin/i })).not.toBeInTheDocument();
  });

  it('renders outbound resource rows', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: [mockResource],
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.getByText('My Plugin')).toBeInTheDocument();
  });

  it('opens SharePluginDialog when Share Plugin button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
        availablePlugins={[{ id: 'p-1', name: 'Test Plugin' }]}
        tenantWorkspaces={[{ id: 'ws-2', name: 'Other Workspace' }]}
      />
    );
    await user.click(screen.getByRole('button', { name: /share plugin/i }));
    // Dialog title appears — use getAllByText since the button text is also "Share Plugin"
    expect(screen.getAllByText('Share Plugin').length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 7. WorkspaceSwitcher (T8.7 acceptance criteria)
// ---------------------------------------------------------------------------

const makeWorkspace = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  memberRole: 'MEMBER' as const,
  description: '',
  _count: { members: 0, teams: 0 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  createdBy: 'user-1',
});

describe('WorkspaceSwitcher', () => {
  const mockSelectWorkspace = vi.fn().mockResolvedValue(undefined);
  const mockCreateWorkspace = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('search input is hidden when workspace count is 5 or fewer', () => {
    const workspaces = [1, 2, 3, 4, 5].map((i) => makeWorkspace(`ws-${i}`, `Workspace ${i}`));
    vi.mocked(useWorkspace).mockReturnValue({
      workspaces,
      currentWorkspace: workspaces[0],
      isLoading: false,
      error: null,
      isAdmin: false,
      isMember: true,
      selectWorkspace: mockSelectWorkspace,
      createWorkspace: mockCreateWorkspace,
      refreshWorkspaces: vi.fn(),
      updateWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      hasRole: vi.fn(),
    });
    render(<WorkspaceSwitcher showCreateButton={false} />);
    // Open the dropdown
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(screen.queryByRole('searchbox', { name: /search workspaces/i })).not.toBeInTheDocument();
  });

  it('search input is visible when workspace count is greater than 5', () => {
    const workspaces = [1, 2, 3, 4, 5, 6].map((i) => makeWorkspace(`ws-${i}`, `Workspace ${i}`));
    vi.mocked(useWorkspace).mockReturnValue({
      workspaces,
      currentWorkspace: workspaces[0],
      isLoading: false,
      error: null,
      isAdmin: false,
      isMember: true,
      selectWorkspace: mockSelectWorkspace,
      createWorkspace: mockCreateWorkspace,
      refreshWorkspaces: vi.fn(),
      updateWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      hasRole: vi.fn(),
    });
    render(<WorkspaceSwitcher showCreateButton={false} />);
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(screen.getByRole('searchbox', { name: /search workspaces/i })).toBeInTheDocument();
  });

  it('filters workspace list when search query is entered', async () => {
    const user = userEvent.setup();
    const workspaces = [
      makeWorkspace('ws-1', 'Alpha Team'),
      makeWorkspace('ws-2', 'Beta Team'),
      makeWorkspace('ws-3', 'Gamma Team'),
      makeWorkspace('ws-4', 'Delta Team'),
      makeWorkspace('ws-5', 'Epsilon Team'),
      makeWorkspace('ws-6', 'Zeta Team'),
    ];
    vi.mocked(useWorkspace).mockReturnValue({
      workspaces,
      currentWorkspace: workspaces[0],
      isLoading: false,
      error: null,
      isAdmin: false,
      isMember: true,
      selectWorkspace: mockSelectWorkspace,
      createWorkspace: mockCreateWorkspace,
      refreshWorkspaces: vi.fn(),
      updateWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      hasRole: vi.fn(),
    });
    render(<WorkspaceSwitcher showCreateButton={false} />);
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    const searchInput = screen.getByRole('searchbox', { name: /search workspaces/i });
    await user.type(searchInput, 'Alpha');
    expect(screen.getAllByText('Alpha Team').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta Team')).not.toBeInTheDocument();
  });

  it('aria-live region announces result count after filtering', async () => {
    const user = userEvent.setup();
    const workspaces = [1, 2, 3, 4, 5, 6].map((i) => makeWorkspace(`ws-${i}`, `Workspace ${i}`));
    vi.mocked(useWorkspace).mockReturnValue({
      workspaces,
      currentWorkspace: workspaces[0],
      isLoading: false,
      error: null,
      isAdmin: false,
      isMember: true,
      selectWorkspace: mockSelectWorkspace,
      createWorkspace: mockCreateWorkspace,
      refreshWorkspaces: vi.fn(),
      updateWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      hasRole: vi.fn(),
    });
    render(<WorkspaceSwitcher showCreateButton={false} />);
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    const searchInput = screen.getByRole('searchbox', { name: /search workspaces/i });
    await user.type(searchInput, 'Workspace 1');
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveTextContent(/1 workspace found/i);
  });
});

// ---------------------------------------------------------------------------
// 5-ext. SharePluginDialog — coverage gap tests (lines 126–157, 211)
// ---------------------------------------------------------------------------

describe('SharePluginDialog — extended coverage', () => {
  const plugins = [
    { id: 'p-1', name: 'Analytics' },
    { id: 'p-2', name: 'Billing' },
  ];
  const workspaces = [
    { id: 'ws-a', name: 'Team Alpha' },
    { id: 'ws-b', name: 'Team Beta' },
    { id: 'ws-c', name: 'Current WS', isCurrent: true },
  ];

  it('shows loading spinner when isLoadingPlugins=true', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={[]}
        targetWorkspaces={workspaces}
        isLoadingPlugins={true}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    // Spinner renders inside the plugin selector area
    const spinnerContainer = document.querySelector('.flex.items-center.justify-center.h-20');
    expect(spinnerContainer).not.toBeNull();
  });

  it('disables Cancel button and shows "Sharing..." text when isSubmitting=true', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        isSubmitting={true}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByText('Sharing...')).toBeInTheDocument();
  });

  it('disables plugin checkboxes when isSubmitting=true', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        isSubmitting={true}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    const analyticsCheckbox = screen.getByRole('checkbox', { name: /analytics/i });
    expect(analyticsCheckbox).toBeDisabled();
  });

  it('filters plugin list when plugin search query is typed', async () => {
    const user = userEvent.setup();
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    const searchInput = screen.getByRole('searchbox', { name: /search installed plugins/i });
    await user.type(searchInput, 'Ana');
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('filters workspace list when workspace search query is typed', async () => {
    const user = userEvent.setup();
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    const searchInput = screen.getByRole('searchbox', { name: /search workspaces/i });
    await user.type(searchInput, 'Alpha');
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Team Beta')).not.toBeInTheDocument();
  });

  it('disables checkbox for isCurrent=true workspace and shows "(current)" label', () => {
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={workspaces}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    const currentCheckbox = screen.getByRole('checkbox', {
      name: /current workspace, disabled/i,
    });
    expect(currentCheckbox).toBeDisabled();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });

  it('shows selection summary after selecting a plugin and a workspace', async () => {
    const user = userEvent.setup();
    render(
      <SharePluginDialog
        open={true}
        plugins={plugins}
        targetWorkspaces={[{ id: 'ws-a', name: 'Team Alpha' }]}
        error={null}
        onClose={vi.fn()}
        onShare={vi.fn()}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /analytics/i }));
    await user.click(screen.getByRole('checkbox', { name: /team alpha/i }));
    // The summary <p> contains a <span>Selected:</span> followed by plugin/workspace names
    expect(screen.getAllByText(/selected/i).length).toBeGreaterThan(0);
    // The selection summary paragraph should contain the names
    const summary = document.querySelector('p.text-xs.text-muted-foreground.bg-muted');
    expect(summary?.textContent).toMatch(/Analytics/);
    expect(summary?.textContent).toMatch(/Team Alpha/);
  });
});

// ---------------------------------------------------------------------------
// 6-ext. SharedResourcesList — coverage gap tests (lines 66, 197, 211–275)
// ---------------------------------------------------------------------------

describe('SharedResourcesList — extended coverage', () => {
  const mockRevokeMutate = vi.fn();
  const outboundResource: SharedResource = {
    id: 'res-out-1',
    resourceType: 'PLUGIN',
    resourceId: 'plugin-1',
    resourceName: 'My Plugin',
    sharedWithWorkspaceName: 'Target WS',
    sharedByEmail: 'admin@example.com',
    sharedAt: '2026-01-15T12:00:00Z',
  };
  const inboundResource: SharedResource = {
    id: 'res-in-1',
    resourceType: 'PLUGIN',
    resourceId: 'plugin-2',
    resourceName: 'Inbound Plugin',
    sharedFromWorkspaceName: 'Source WS',
    sharedByEmail: 'other@example.com',
    sharedAt: '2026-01-10T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockRevokeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
  });

  it('shows "Share Your First Plugin" button for admin when outbound list is empty', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /share your first plugin/i })).toBeInTheDocument();
  });

  it('does not show "Share Your First Plugin" button for non-admin', () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={false}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /share your first plugin/i })
    ).not.toBeInTheDocument();
  });

  it('renders inbound resource rows in the "Resources Shared With This Workspace" section', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: [inboundResource],
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    expect(screen.getByText('Inbound Plugin')).toBeInTheDocument();
    expect(screen.getByText('Resources Shared With This Workspace')).toBeInTheDocument();
  });

  it('clicking Revoke on a row opens the RevokeShareDialog', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({
      data: [outboundResource],
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    const revokeBtn = screen.getByRole('button', { name: /revoke access to my plugin/i });
    await user.click(revokeBtn);
    // RevokeShareDialog title should now be visible
    expect(screen.getByText('Revoke Sharing')).toBeInTheDocument();
  });

  it('confirming revoke calls revokeMutation.mutate with the resource id', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({
      data: [outboundResource],
      isLoading: false,
    } as ReturnType<typeof useQuery>);
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
      />
    );
    // Open revoke dialog
    await user.click(screen.getByRole('button', { name: /revoke access to my plugin/i }));
    // Confirm revoke
    await user.click(screen.getByRole('button', { name: /revoke access/i }));
    expect(mockRevokeMutate).toHaveBeenCalledWith(outboundResource.id);
  });

  it('sets shareError state when handleShare throws', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof useQuery
    >);
    const { apiClient: mockApiClient } = await import('@/lib/api-client');
    vi.spyOn(mockApiClient, 'shareWorkspaceResource').mockRejectedValueOnce({
      response: { data: { error: { message: 'Share failed' } } },
    });
    render(
      <SharedResourcesList
        workspaceId="ws-1"
        isAdmin={true}
        sharingEnabled={true}
        onGoToSettings={vi.fn()}
        availablePlugins={[{ id: 'p-1', name: 'Test Plugin' }]}
        tenantWorkspaces={[{ id: 'ws-2', name: 'Other WS' }]}
      />
    );
    // Open share dialog
    await user.click(screen.getByRole('button', { name: /share plugin/i }));
    // Select a plugin and workspace
    await user.click(screen.getByRole('checkbox', { name: /test plugin/i }));
    await user.click(screen.getByRole('checkbox', { name: /other ws/i }));
    await user.click(screen.getByRole('button', { name: /share selected/i }));
    await waitFor(() => {
      expect(screen.getByText('Share failed')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 4-ext. WorkspaceSettingsForm — coverage gap tests (lines 126–135, 177, 252)
// ---------------------------------------------------------------------------

describe('WorkspaceSettingsForm — extended coverage', () => {
  const defaultSettings = {
    defaultTeamRole: 'MEMBER' as const,
    allowCrossWorkspaceSharing: false,
    maxMembers: 0,
    isDiscoverable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Discard button resets form to last saved values', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    // Toggle sharing to dirty the form
    await user.click(screen.getByRole('switch', { name: /allow cross-workspace sharing/i }));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // Click Discard
    await user.click(screen.getByRole('button', { name: /discard/i }));

    // Unsaved indicator should be gone
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it('shows plain <span> with role text when isAdmin=false (readonly path)', () => {
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={false} />
    );
    // In readonly mode, defaultTeamRole is shown as a <span> not a Select
    expect(screen.getByText('MEMBER')).toBeInTheDocument();
    // The Select trigger should NOT be present in readonly mode
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows "Failed to save settings" fallback when error response has no message field', async () => {
    const { apiClient: mockApiClient } = await import('@/lib/api-client');
    vi.spyOn(mockApiClient, 'patchWorkspaceSettings').mockRejectedValueOnce(
      new Error('Network error with no structured body')
    );
    const user = userEvent.setup();
    render(
      <WorkspaceSettingsForm workspaceId="ws-1" initialSettings={defaultSettings} isAdmin={true} />
    );
    await user.click(screen.getByRole('switch', { name: /allow cross-workspace sharing/i }));
    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => {
      expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
    });
  });
});

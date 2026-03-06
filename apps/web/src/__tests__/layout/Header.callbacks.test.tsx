// apps/web/src/__tests__/layout/Header.callbacks.test.tsx
//
// H-02 coverage fix: exercise Header callback functions that are not covered
// by Header.test.tsx because its SearchOverlay/NotificationBell mocks are static.
//
// Covers:
//   handleSearch         — calls POST /api/v1/search, returns results
//   handleMarkAllRead    — calls PATCH /api/v1/notifications/read-all, resets unreadCount
//   handleNotificationClick — calls PATCH /api/v1/notifications/:id/read, navigates if link
//   handleSearchSelect   — saves to localStorage, navigates to /:type/:id
//   handleSearchClose    — sets searchOpen false (no crash)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockNavigate, mockUseTenantTheme, mockUseAuthStore, mockUseNotificationStream } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockUseTenantTheme: vi.fn(),
    mockUseAuthStore: vi.fn(),
    mockUseNotificationStream: vi.fn(),
  }));

// Hoisted callback captures — these will be set by the UI mocks below
const {
  capturedOnSearch,
  capturedOnSelect,
  capturedOnClose,
  capturedOnMarkAllRead,
  capturedOnNotificationClick,
} = vi.hoisted(() => ({
  capturedOnSearch: { current: null as null | ((q: string) => Promise<unknown[]>) },
  capturedOnSelect: { current: null as null | ((item: unknown) => void) },
  capturedOnClose: { current: null as null | (() => void) },
  capturedOnMarkAllRead: { current: null as null | (() => void) },
  capturedOnNotificationClick: { current: null as null | ((n: unknown) => void) },
}));

// ---------------------------------------------------------------------------
// Mocks — these mocks capture callbacks for direct invocation in tests
// ---------------------------------------------------------------------------

vi.mock('@/contexts/ThemeContext', () => ({
  useTenantTheme: mockUseTenantTheme,
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

vi.mock('@/contexts', () => ({
  useIntl: () => ({ locale: 'en', setLocale: vi.fn() }),
  useWorkspace: () => ({ workspace: null }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@plexica/ui', () => ({
  LanguageSelector: () => <div data-testid="lang-selector" />,
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // NotificationBell mock captures its callback props
  NotificationBell: ({
    onMarkAllRead,
    onNotificationClick,
  }: {
    unreadCount: number;
    notifications: unknown[];
    onMarkAllRead: () => void;
    onNotificationClick: (n: unknown) => void;
  }) => {
    capturedOnMarkAllRead.current = onMarkAllRead;
    capturedOnNotificationClick.current = onNotificationClick;
    return <div data-testid="notification-bell" />;
  },
  // SearchOverlay mock captures its callback props
  SearchOverlay: ({
    onSearch,
    onSelect,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
    onSearch: (q: string) => Promise<unknown[]>;
    onSelect: (item: unknown) => void;
    recentSearches: string[];
    placeholder: string;
  }) => {
    capturedOnSearch.current = onSearch;
    capturedOnSelect.current = onSelect;
    capturedOnClose.current = onClose;
    return <div data-testid="search-overlay" />;
  },
}));

vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock('@/components/shell/UserProfileMenu', () => ({
  UserProfileMenu: () => <div data-testid="user-profile-menu" />,
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@/hooks/useNotificationStream', () => ({
  useNotificationStream: mockUseNotificationStream,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { Header } from '@/components/Layout/Header';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'tok-test-abc';
const TOKEN_STATE = {
  tokenSet: { accessToken: TOKEN, refreshToken: 'r', expiresAt: Date.now() + 3_600_000 },
  user: { tenantId: 'acme' },
};

function setupMocks() {
  mockUseTenantTheme.mockReturnValue({
    tenantTheme: { ...DEFAULT_TENANT_THEME, logo: null },
    tenantThemeLoading: false,
    tenantThemeError: null,
    refreshTenantTheme: vi.fn(),
  });
  mockUseAuthStore.mockImplementation((selector?: (s: typeof TOKEN_STATE) => unknown) =>
    selector ? selector(TOKEN_STATE) : TOKEN_STATE
  );
  mockUseNotificationStream.mockReturnValue({ lastEvent: null });
}

function renderHeader() {
  return render(<Header onMenuClick={vi.fn()} />);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnSearch.current = null;
  capturedOnSelect.current = null;
  capturedOnClose.current = null;
  capturedOnMarkAllRead.current = null;
  capturedOnNotificationClick.current = null;
  setupMocks();
  // Suppress fetch-related noise
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ notifications: [], unreadCount: 0 }),
  } as unknown as Response);
});

// ---------------------------------------------------------------------------
// handleSearch
// ---------------------------------------------------------------------------

describe('Header — handleSearch callback', () => {
  it('calls POST /api/v1/search and returns results when token and query are present', async () => {
    const mockResults = [{ id: '1', title: 'Workspace Alpha', type: 'workspace' }];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // First call: fetchNotifications on mount
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: [], unreadCount: 0 }),
      } as unknown as Response)
      // Second call: handleSearch POST /api/v1/search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockResults }),
      } as unknown as Response);

    await act(async () => renderHeader());

    expect(capturedOnSearch.current).toBeTruthy();
    let results!: unknown[];
    await act(async () => {
      results = await capturedOnSearch.current!('alpha');
    });

    const fetchCalls = fetchSpy.mock.calls as [string, RequestInit][];
    const searchCall = fetchCalls.find(([url]) => String(url).includes('/search'));
    expect(searchCall).toBeTruthy();
    expect(searchCall![1].method).toBe('POST');
    expect(JSON.parse(searchCall![1].body as string)).toMatchObject({ query: 'alpha', limit: 10 });
    expect(results).toEqual(mockResults);

    fetchSpy.mockRestore();
  });

  it('returns empty array when query is blank', async () => {
    await act(async () => renderHeader());

    let results!: unknown[];
    await act(async () => {
      results = await capturedOnSearch.current!('   ');
    });

    expect(results).toEqual([]);
  });

  it('returns empty array when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    await act(async () => renderHeader());

    let results!: unknown[];
    await act(async () => {
      results = await capturedOnSearch.current!('query');
    });

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleSearchSelect
// ---------------------------------------------------------------------------

describe('Header — handleSearchSelect callback', () => {
  it('saves the search term to localStorage and navigates to /:type/:id', async () => {
    // localStorage in test env is a vi.fn() mock (see src/test/setup.ts).
    // Wire getItem to return null so loadRecentSearches returns [].
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    await act(async () => renderHeader());

    await act(async () => {
      capturedOnSelect.current!({ id: '42', title: 'My Workspace', type: 'workspace' });
    });

    // Should have called setItem with 'plexica-recent-searches' containing 'My Workspace'
    const setItemCalls = vi
      .mocked(localStorage.setItem)
      .mock.calls.filter(([key]) => key === 'plexica-recent-searches');
    expect(setItemCalls.length).toBeGreaterThan(0);
    const saved = JSON.parse(setItemCalls[0][1] as string) as string[];
    expect(saved).toContain('My Workspace');

    // Should have navigated to /workspace/42
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining('workspace') })
    );
  });
});

// ---------------------------------------------------------------------------
// handleSearchClose
// ---------------------------------------------------------------------------

describe('Header — handleSearchClose callback', () => {
  it('does not throw when called', async () => {
    await act(async () => renderHeader());

    expect(() => {
      act(() => {
        capturedOnClose.current!();
      });
    }).not.toThrow();

    // Component should still be in DOM
    expect(screen.getByTestId('search-overlay')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// handleMarkAllRead
// ---------------------------------------------------------------------------

describe('Header — handleMarkAllRead callback', () => {
  it('calls PATCH /api/v1/notifications/read-all', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as unknown as Response);

    await act(async () => renderHeader());

    await act(async () => {
      capturedOnMarkAllRead.current!();
    });

    const patchCalls = (fetchSpy.mock.calls as [string, RequestInit][]).filter(
      ([url, opts]) => String(url).includes('read-all') && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });

  it('does not throw when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await act(async () => renderHeader());

    await expect(
      act(async () => {
        capturedOnMarkAllRead.current!();
      })
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleNotificationClick
// ---------------------------------------------------------------------------

describe('Header — handleNotificationClick callback', () => {
  it('calls PATCH /api/v1/notifications/:id/read for unread notifications', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as unknown as Response);

    await act(async () => renderHeader());

    const unreadNotification = {
      id: 'notif-99',
      read: false,
      title: 'New message',
      message: 'You have a new message',
      createdAt: new Date().toISOString(),
      metadata: undefined,
    };

    await act(async () => {
      capturedOnNotificationClick.current!(unreadNotification);
    });

    const patchCalls = (fetchSpy.mock.calls as [string, RequestInit][]).filter(
      ([url, opts]) => String(url).includes('notif-99') && opts?.method === 'PATCH'
    );
    expect(patchCalls.length).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });

  it('navigates when notification has a metadata.link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as unknown as Response);

    await act(async () => renderHeader());

    const linkedNotification = {
      id: 'notif-100',
      read: true, // already read — skip PATCH
      title: 'Linked',
      message: 'Click to navigate',
      createdAt: new Date().toISOString(),
      metadata: { link: '/workspaces/ws-1' },
    };

    await act(async () => {
      capturedOnNotificationClick.current!(linkedNotification);
    });

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/workspaces/ws-1' }));
  });

  it('does not call PATCH for already-read notifications', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as unknown as Response);

    await act(async () => renderHeader());

    const readNotification = {
      id: 'notif-101',
      read: true,
      title: 'Old',
      message: 'Already read',
      createdAt: new Date().toISOString(),
      metadata: undefined,
    };

    await act(async () => {
      capturedOnNotificationClick.current!(readNotification);
    });

    const patchCalls = (fetchSpy.mock.calls as [string, RequestInit][]).filter(
      ([url, opts]) => String(url).includes('notif-101') && opts?.method === 'PATCH'
    );
    expect(patchCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });
});

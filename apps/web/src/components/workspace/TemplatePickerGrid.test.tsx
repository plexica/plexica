// apps/web/src/components/workspace/TemplatePickerGrid.test.tsx
//
// T011-23: Unit tests for TemplatePickerGrid component.
// Spec 011 Phase 4 — FR-015, FR-021, FR-022.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatePickerGrid } from './TemplatePickerGrid';
import type { TemplateCardData } from './TemplateCard';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn() },
  default: { get: vi.fn() },
}));

import { apiClient } from '@/lib/api-client';

function makeTemplates(count = 2): TemplateCardData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tmpl-${i}`,
    name: `Template ${i}`,
    description: `Description ${i}`,
    isDefault: i === 0,
    sourcePluginName: `plugin-${i}`,
    items: [{ type: 'plugin' as const }],
  }));
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('TemplatePickerGrid', () => {
  it('shows loading skeleton during fetch', () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockReturnValue(
      new Promise(() => {})
    );
    render(<TemplatePickerGrid />, { wrapper });
    expect(screen.getByLabelText('Loading templates')).toBeInTheDocument();
  });

  it('renders the "No template" option first', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid />, { wrapper });
    const options = await screen.findAllByRole('radio');
    // First option must be "No template"
    expect(options[0]).toHaveTextContent('No template');
  });

  it('renders all fetched templates after "No template"', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid />, { wrapper });
    expect(await screen.findByText('Template 0')).toBeInTheDocument();
    expect(screen.getByText('Template 1')).toBeInTheDocument();
  });

  it('has role="radiogroup" with aria-label', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      []
    );
    render(<TemplatePickerGrid />, { wrapper });
    const group = await screen.findByRole('radiogroup', { name: 'Select workspace template' });
    expect(group).toBeInTheDocument();
  });

  it('calls onSelect with null when "No template" selected', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(1)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const options = await screen.findAllByRole('radio');
    fireEvent.click(options[0]); // No template
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect with template id when template selected', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const tmplCard = await screen.findByText('Template 0');
    fireEvent.click(tmplCard.closest('[role="radio"]')!);
    expect(onSelect).toHaveBeenCalledWith('tmpl-0');
  });

  it('shows only "No template" option when templates list is empty', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      []
    );
    render(<TemplatePickerGrid />, { wrapper });
    const options = await screen.findAllByRole('radio');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('No template');
  });

  it('marks the passed selectedId as selected (fully controlled)', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid selectedId="tmpl-1" />, { wrapper });
    await screen.findByText('Template 1');
    const selected = screen
      .getAllByRole('radio')
      .find((el) => el.getAttribute('aria-checked') === 'true');
    expect(selected).toHaveTextContent('Template 1');
  });

  it('reflects updated selectedId prop when parent re-renders (controlled sync)', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    // WARNING-4 fix: reuse the same QueryClient so we don't trigger a refetch
    // (creating a new QueryClient in rerender causes the query to re-run and the
    // in-flight state can mask the updated aria-checked value).
    const sharedClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function sharedWrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={sharedClient}>{children}</QueryClientProvider>;
    }

    const { rerender } = render(<TemplatePickerGrid selectedId="tmpl-0" />, {
      wrapper: sharedWrapper,
    });
    await screen.findByText('Template 0');

    let selected = screen
      .getAllByRole('radio')
      .find((el) => el.getAttribute('aria-checked') === 'true');
    expect(selected).toHaveTextContent('Template 0');

    // Parent changes selection — component must reflect the new value
    rerender(
      <QueryClientProvider client={sharedClient}>
        <TemplatePickerGrid selectedId="tmpl-1" />
      </QueryClientProvider>
    );
    await waitFor(() => {
      const updated = screen
        .getAllByRole('radio')
        .find((el) => el.getAttribute('aria-checked') === 'true');
      expect(updated).toHaveTextContent('Template 1');
    });
  });

  it('shows error alert and retry button when fetch fails', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockRejectedValue(
      new Error('Network error')
    );
    render(<TemplatePickerGrid />, { wrapper });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load templates.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries fetch when Retry button clicked', async () => {
    const getMock = vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get);
    getMock.mockRejectedValueOnce(new Error('Network error'));
    getMock.mockResolvedValue(makeTemplates(1));

    render(<TemplatePickerGrid />, { wrapper });
    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);
    expect(await screen.findByText('Template 0')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // F-022: Roving tabindex + arrow-key navigation
  // -------------------------------------------------------------------------

  it('ArrowRight moves focus to the next card and selects it', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const group = await screen.findByRole('radiogroup');
    // Initial state: first card (index 0) has tabIndex=0
    const cards = screen.getAllByRole('radio');
    expect(cards[0]).toHaveAttribute('tabindex', '0');
    expect(cards[1]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(cards[0]).toHaveAttribute('tabindex', '-1');
    expect(cards[1]).toHaveAttribute('tabindex', '0');
    // H-005: selection follows focus (WAI-ARIA radiogroup pattern)
    // allOptions = [NO_TEMPLATE_OPTION, tmpl-0, tmpl-1] — index 1 is 'tmpl-0'
    expect(onSelect).toHaveBeenCalledWith('tmpl-0');
  });

  it('ArrowDown moves focus to the next card and selects it', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const group = await screen.findByRole('radiogroup');
    const cards = screen.getAllByRole('radio');

    fireEvent.keyDown(group, { key: 'ArrowDown' });

    expect(cards[0]).toHaveAttribute('tabindex', '-1');
    expect(cards[1]).toHaveAttribute('tabindex', '0');
    // H-005: selection follows focus
    expect(onSelect).toHaveBeenCalledWith('tmpl-0');
  });

  it('ArrowLeft moves focus to the previous card and selects it', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const group = await screen.findByRole('radiogroup');
    const cards = screen.getAllByRole('radio');

    // Move forward first so we can move back
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(cards[1]).toHaveAttribute('tabindex', '0');
    onSelect.mockClear();

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(cards[0]).toHaveAttribute('tabindex', '0');
    expect(cards[1]).toHaveAttribute('tabindex', '-1');
    // H-005: moving back to index 0 selects "No template" → null
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('ArrowUp moves focus to the previous card and selects it', async () => {
    const onSelect = vi.fn();
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid onSelect={onSelect} />, { wrapper });
    const group = await screen.findByRole('radiogroup');
    const cards = screen.getAllByRole('radio');

    // Move forward first so we can move back
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(cards[1]).toHaveAttribute('tabindex', '0');
    onSelect.mockClear();

    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(cards[0]).toHaveAttribute('tabindex', '0');
    expect(cards[1]).toHaveAttribute('tabindex', '-1');
    // H-005: moving back to index 0 selects "No template" → null
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('arrow-key navigation does not go out of bounds', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTemplates(2)
    );
    render(<TemplatePickerGrid />, { wrapper });
    const group = await screen.findByRole('radiogroup');
    const cards = screen.getAllByRole('radio');
    // Total: 3 cards (No template + 2 from makeTemplates)

    // At index 0 — ArrowLeft should clamp to 0
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(cards[0]).toHaveAttribute('tabindex', '0');

    // Move to last card (index 2)
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(cards[2]).toHaveAttribute('tabindex', '0');

    // At last index — ArrowRight should clamp to last
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(cards[2]).toHaveAttribute('tabindex', '0');
  });
});

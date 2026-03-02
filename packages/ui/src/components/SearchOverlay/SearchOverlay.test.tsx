// File: packages/ui/src/components/SearchOverlay/SearchOverlay.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchOverlay } from './SearchOverlay';
import type { SearchResultItem } from './SearchOverlay';

const makeResult = (overrides: Partial<SearchResultItem> = {}): SearchResultItem => ({
  id: 'res-1',
  title: 'Test Result',
  type: 'page',
  snippet: 'A short snippet',
  ...overrides,
});

describe('SearchOverlay', () => {
  it('renders the search dialog when open=true', () => {
    render(<SearchOverlay open={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders nothing when open=false', () => {
    render(<SearchOverlay open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the default placeholder text', () => {
    render(<SearchOverlay open={true} />);
    expect(screen.getByPlaceholderText('Search everywhere…')).toBeInTheDocument();
  });

  it('accepts a custom placeholder', () => {
    render(<SearchOverlay open={true} placeholder="Find something…" />);
    expect(screen.getByPlaceholderText('Find something…')).toBeInTheDocument();
  });

  it('shows "Start typing to search" when there is no query and no recent searches', () => {
    render(<SearchOverlay open={true} />);
    expect(screen.getByText(/start typing to search/i)).toBeInTheDocument();
  });

  it('renders recent searches when no query is entered', () => {
    render(<SearchOverlay open={true} recentSearches={['react hooks', 'typescript']} />);
    expect(screen.getByText('Recent Searches')).toBeInTheDocument();
    expect(screen.getByText('react hooks')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  it('populates input when a recent search is clicked', () => {
    render(<SearchOverlay open={true} recentSearches={['react hooks']} />);
    fireEvent.click(screen.getByText('react hooks'));
    const input = screen.getByRole('searchbox');
    expect((input as HTMLInputElement).value).toBe('react hooks');
  });

  it('shows a clear button after typing in the search box', () => {
    render(<SearchOverlay open={true} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
  });

  it('clears the query when the clear button is clicked', () => {
    render(<SearchOverlay open={true} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('calls onClose when the Esc button is clicked', () => {
    const onClose = vi.fn();
    render(<SearchOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close search/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<SearchOverlay open={true} onClose={onClose} />);
    // The backdrop is aria-hidden, get by its presence in the DOM
    const backdrop = document.querySelector('.fixed.inset-0.z-50.bg-black\\/60');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onSearch with the query (after debounce) and shows results', async () => {
    vi.useFakeTimers();
    const results = [
      makeResult({ id: '1', title: 'Result Alpha' }),
      makeResult({ id: '2', title: 'Result Beta' }),
    ];
    const onSearch = vi.fn().mockResolvedValue(results);
    render(<SearchOverlay open={true} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
    // Flush all pending timers (debounce) AND microtasks (Promise callbacks)
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onSearch).toHaveBeenCalledWith('alpha');
    expect(screen.getByText('Result Alpha')).toBeInTheDocument();
    expect(screen.getByText('Result Beta')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('shows "No results" message when search returns empty array', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn().mockResolvedValue([]);
    render(<SearchOverlay open={true} onSearch={onSearch} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xyzzy' } });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(screen.getByText(/no results for/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('calls onSelect and onClose when a result is clicked', async () => {
    vi.useFakeTimers();
    const result = makeResult({ id: '1', title: 'Clickable Result' });
    const onSearch = vi.fn().mockResolvedValue([result]);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<SearchOverlay open={true} onSearch={onSearch} onSelect={onSelect} onClose={onClose} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'click' } });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(screen.getByText('Clickable Result')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clickable Result'));
    expect(onSelect).toHaveBeenCalledWith(result);
    expect(onClose).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('renders the keyboard navigation footer hints', () => {
    render(<SearchOverlay open={true} />);
    expect(screen.getByText('navigate')).toBeInTheDocument();
    expect(screen.getByText('select')).toBeInTheDocument();
    expect(screen.getByText('close')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders without crashing with required title', () => {
    render(<EmptyState title="No results found" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders title as an h3 element', () => {
    render(<EmptyState title="No data" />);
    const title = screen.getByText('No data');
    expect(title.tagName).toBe('H3');
  });

  it('applies custom className', () => {
    const { container } = render(<EmptyState title="Empty" className="custom-empty" />);
    expect(container.firstChild).toHaveClass('custom-empty');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<EmptyState ref={ref} title="Empty" />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No results" description="Try adjusting your filters" />);
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No results" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No results" icon={<svg data-testid="custom-icon" />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders action button and handles click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<EmptyState title="No results" action={{ label: 'Create new', onClick }} />);

    const button = screen.getByRole('button', { name: /create new/i });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action button', async () => {
    const primaryClick = vi.fn();
    const secondaryClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Create', onClick: primaryClick }}
        secondaryAction={{ label: 'Learn more', onClick: secondaryClick }}
      />
    );

    expect(screen.getByRole('button', { name: /learn more/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /learn more/i }));
    expect(secondaryClick).toHaveBeenCalledTimes(1);
  });

  it('does not render secondary action without primary action', () => {
    render(
      <EmptyState title="No results" secondaryAction={{ label: 'Learn more', onClick: vi.fn() }} />
    );
    // secondaryAction only renders inside the action block, which requires action prop
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument();
  });
});

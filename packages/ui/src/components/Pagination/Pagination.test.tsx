import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Pagination, getPageNumbers } from './Pagination';

describe('Pagination', () => {
  it('renders without crashing', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('returns null when totalPages is 0', () => {
    const { container } = render(<Pagination page={1} totalPages={0} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correct page buttons for few pages', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Page 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Page 3')).toBeInTheDocument();
  });

  it('disables previous and first buttons on first page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('First page')).toBeDisabled();
  });

  it('disables next and last buttons on last page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Last page')).toBeDisabled();
  });

  it('enables all navigation buttons on a middle page', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Previous page')).not.toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
    expect(screen.getByLabelText('First page')).not.toBeDisabled();
    expect(screen.getByLabelText('Last page')).not.toBeDisabled();
  });

  it('calls onPageChange with correct page on button click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('Page 4'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange on Previous button click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange on Next button click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange on First page button click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={10} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('First page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange on Last page button click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={10} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('Last page'));
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  it('marks current page with aria-current', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Page 3')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Page 2')).not.toHaveAttribute('aria-current');
  });

  it('hides first/last buttons when showFirstLast is false', () => {
    render(<Pagination page={3} totalPages={10} onPageChange={() => {}} showFirstLast={false} />);
    expect(screen.queryByLabelText('First page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Last page')).not.toBeInTheDocument();
  });

  it('has navigation role with aria-label', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Pagination');
  });

  it('applies custom className', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} className="my-class" />);
    expect(screen.getByRole('navigation')).toHaveClass('my-class');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLElement>();
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });
});

describe('getPageNumbers', () => {
  it('returns all pages when total is small', () => {
    expect(getPageNumbers(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns ellipsis on the right when on first page', () => {
    const result = getPageNumbers(1, 20, 1);
    expect(result[0]).toBe(1);
    expect(result).toContain('ellipsis');
    expect(result[result.length - 1]).toBe(20);
  });

  it('returns ellipsis on the left when on last page', () => {
    const result = getPageNumbers(20, 20, 1);
    expect(result[0]).toBe(1);
    expect(result).toContain('ellipsis');
    expect(result[result.length - 1]).toBe(20);
  });

  it('returns ellipsis on both sides for a middle page', () => {
    const result = getPageNumbers(10, 20, 1);
    expect(result[0]).toBe(1);
    expect(result[result.length - 1]).toBe(20);
    // Should have two ellipsis entries
    const ellipsisCount = result.filter((p) => p === 'ellipsis').length;
    expect(ellipsisCount).toBe(2);
  });
});

// File: apps/web/src/__tests__/layout-engine/SectionOrderList.test.tsx
//
// T014-28 — Unit tests for SectionOrderList component.
// Spec 014 Frontend Layout Engine — FR-004, FR-012, NFR-010.
//
// Tests:
//   Renders nothing when sections array is empty
//   Renders all sections with their labels
//   Sections sorted by override order
//   Up button disabled for first section
//   Down button disabled for last section
//   Calls onOrderChange(sectionId, 'up') on up click
//   Calls onOrderChange(sectionId, 'down') on down click
//   All buttons disabled when disabled=true
//   Shows section IDs in each row
//   Correct position numbers displayed

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  ChevronUp: () => <svg data-testid="icon-chevron-up" />,
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { SectionOrderList } from '@/components/layout-engine/SectionOrderList';
import type { ManifestSection, SectionOverride } from '@plexica/types';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeSection(sectionId: string, label: string, order: number): ManifestSection {
  return { sectionId, label, order };
}

const THREE_SECTIONS: ManifestSection[] = [
  makeSection('billing', 'Billing', 0),
  makeSection('contact', 'Contact', 1),
  makeSection('shipping', 'Shipping', 2),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionOrderList — empty state', () => {
  it('renders nothing when sections is empty', () => {
    const { container } = render(
      <SectionOrderList sections={[]} overrides={[]} onOrderChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('SectionOrderList — rendering', () => {
  it('renders all section labels', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Shipping')).toBeInTheDocument();
  });

  it('renders the section-order-list data-testid', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByTestId('section-order-list')).toBeInTheDocument();
  });

  it('renders each section-item data-testid', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByTestId('section-item-billing')).toBeInTheDocument();
    expect(screen.getByTestId('section-item-contact')).toBeInTheDocument();
    expect(screen.getByTestId('section-item-shipping')).toBeInTheDocument();
  });

  it('shows section IDs', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByText('billing')).toBeInTheDocument();
    expect(screen.getByText('contact')).toBeInTheDocument();
    expect(screen.getByText('shipping')).toBeInTheDocument();
  });

  it('sorts sections by override order when overrides provided', () => {
    const overrides: SectionOverride[] = [
      { sectionId: 'shipping', order: 0 },
      { sectionId: 'billing', order: 1 },
      { sectionId: 'contact', order: 2 },
    ];
    render(
      <SectionOrderList sections={THREE_SECTIONS} overrides={overrides} onOrderChange={vi.fn()} />
    );
    const items = screen.getAllByRole('listitem');
    // shipping should be first
    expect(items[0]).toHaveAttribute('data-testid', 'section-item-shipping');
    expect(items[1]).toHaveAttribute('data-testid', 'section-item-billing');
    expect(items[2]).toHaveAttribute('data-testid', 'section-item-contact');
  });
});

describe('SectionOrderList — boundary buttons', () => {
  it('disables the up button for the first section', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    const upButton = screen.getByRole('button', { name: /move billing up/i });
    expect(upButton).toBeDisabled();
  });

  it('disables the down button for the last section', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    const downButton = screen.getByRole('button', { name: /move shipping down/i });
    expect(downButton).toBeDisabled();
  });

  it('enables up button for sections that are not first', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /move contact up/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /move shipping up/i })).not.toBeDisabled();
  });

  it('enables down button for sections that are not last', () => {
    render(<SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /move billing down/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /move contact down/i })).not.toBeDisabled();
  });
});

describe('SectionOrderList — interactions', () => {
  it('calls onOrderChange with sectionId and "up" when up button clicked', () => {
    const onOrderChange = vi.fn();
    render(
      <SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={onOrderChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /move contact up/i }));
    expect(onOrderChange).toHaveBeenCalledWith('contact', 'up');
  });

  it('calls onOrderChange with sectionId and "down" when down button clicked', () => {
    const onOrderChange = vi.fn();
    render(
      <SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={onOrderChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /move contact down/i }));
    expect(onOrderChange).toHaveBeenCalledWith('contact', 'down');
  });

  it('does not call onOrderChange when button is disabled (first item up)', () => {
    const onOrderChange = vi.fn();
    render(
      <SectionOrderList sections={THREE_SECTIONS} overrides={[]} onOrderChange={onOrderChange} />
    );
    const upButton = screen.getByRole('button', { name: /move billing up/i });
    fireEvent.click(upButton);
    expect(onOrderChange).not.toHaveBeenCalled();
  });
});

describe('SectionOrderList — disabled prop', () => {
  it('disables all buttons when disabled=true', () => {
    render(
      <SectionOrderList
        sections={THREE_SECTIONS}
        overrides={[]}
        onOrderChange={vi.fn()}
        disabled={true}
      />
    );
    const allButtons = screen.getAllByRole('button');
    allButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});

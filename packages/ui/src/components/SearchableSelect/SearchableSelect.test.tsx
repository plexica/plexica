import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchableSelect } from './SearchableSelect';

const defaultOptions = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('SearchableSelect', () => {
  it('renders without crashing', () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={defaultOptions} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders with a placeholder', () => {
    render(
      <SearchableSelect
        value=""
        onChange={vi.fn()}
        options={defaultOptions}
        placeholder="Pick a fruit"
      />
    );
    expect(screen.getByText('Pick a fruit')).toBeInTheDocument();
  });

  it('renders the default placeholder when none is provided', () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={defaultOptions} />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <SearchableSelect
        value=""
        onChange={vi.fn()}
        options={defaultOptions}
        className="custom-select"
      />
    );
    expect(screen.getByRole('combobox')).toHaveClass('custom-select');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<SearchableSelect ref={ref} value="" onChange={vi.fn()} options={defaultOptions} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('displays the selected value label', () => {
    render(<SearchableSelect value="banana" onChange={vi.fn()} options={defaultOptions} />);
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={defaultOptions} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders a combobox trigger with correct attributes', () => {
    render(<SearchableSelect value="" onChange={vi.fn()} options={defaultOptions} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

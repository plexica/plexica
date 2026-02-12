import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from './Select';

// Radix Select uses DOM APIs not available in jsdom. Polyfill them.
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture =
    HTMLElement.prototype.hasPointerCapture || vi.fn().mockReturnValue(false);
  HTMLElement.prototype.setPointerCapture = HTMLElement.prototype.setPointerCapture || vi.fn();
  HTMLElement.prototype.releasePointerCapture =
    HTMLElement.prototype.releasePointerCapture || vi.fn();
  HTMLElement.prototype.scrollIntoView = HTMLElement.prototype.scrollIntoView || vi.fn();
});

describe('Select', () => {
  const renderSelect = (
    props: { defaultValue?: string; disabled?: boolean; triggerClassName?: string } = {}
  ) => {
    return render(
      <Select defaultValue={props.defaultValue}>
        <SelectTrigger className={props.triggerClassName} disabled={props.disabled}>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="cherry">Cherry</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  it('renders the trigger without crashing', () => {
    renderSelect();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('displays the placeholder text', () => {
    renderSelect();
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('applies custom className to SelectTrigger', () => {
    renderSelect({ triggerClassName: 'my-trigger' });
    expect(screen.getByRole('combobox')).toHaveClass('my-trigger');
  });

  it('applies base classes to SelectTrigger', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md', 'border', 'border-border');
  });

  it('forwards ref to SelectTrigger', () => {
    const ref = vi.fn();
    render(
      <Select>
        <SelectTrigger ref={ref}>
          <SelectValue placeholder="Test" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(ref).toHaveBeenCalled();
  });

  it('displays selected value when defaultValue is set', () => {
    renderSelect({ defaultValue: 'banana' });
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('renders trigger as disabled when disabled prop is set', () => {
    renderSelect({ disabled: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('opens the dropdown when trigger is clicked', async () => {
    const user = userEvent.setup();
    renderSelect();

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Radix portals the content; items should appear in the document
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('renders the group label when dropdown is open', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Fruits')).toBeInTheDocument();
  });

  it('has correct aria attributes on trigger', () => {
    renderSelect();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded');
  });

  it('renders a chevron icon inside the trigger', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Test" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    );
    // Lucide ChevronDown renders an SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});

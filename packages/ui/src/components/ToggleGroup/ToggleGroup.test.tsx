import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleGroup, ToggleGroupItem } from './ToggleGroup';

describe('ToggleGroup', () => {
  it('renders without crashing', () => {
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('applies custom className to ToggleGroup', () => {
    render(
      <ToggleGroup type="single" className="custom-group">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>
    );
    const group = screen.getByRole('group');
    expect(group).toHaveClass('custom-group');
  });

  it('applies custom className to ToggleGroupItem', () => {
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a" className="custom-item">
          A
        </ToggleGroupItem>
      </ToggleGroup>
    );
    expect(screen.getByText('A')).toHaveClass('custom-item');
  });

  it('forwards ref on ToggleGroup', () => {
    const ref = vi.fn();
    render(
      <ToggleGroup type="single" ref={ref}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>
    );
    expect(ref).toHaveBeenCalled();
  });

  it('forwards ref on ToggleGroupItem', () => {
    const ref = vi.fn();
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a" ref={ref}>
          A
        </ToggleGroupItem>
      </ToggleGroup>
    );
    expect(ref).toHaveBeenCalled();
  });

  it('selects item on click in single mode', async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );

    const itemA = screen.getByText('A');
    await user.click(itemA);
    expect(itemA).toHaveAttribute('data-state', 'on');
    expect(screen.getByText('B')).toHaveAttribute('data-state', 'off');
  });

  it('only one item selected at a time in single mode', async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );

    await user.click(screen.getByText('A'));
    expect(screen.getByText('A')).toHaveAttribute('data-state', 'on');

    await user.click(screen.getByText('B'));
    expect(screen.getByText('B')).toHaveAttribute('data-state', 'on');
    expect(screen.getByText('A')).toHaveAttribute('data-state', 'off');
  });

  it('allows multiple selections in multiple mode', async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="multiple">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
        <ToggleGroupItem value="c">C</ToggleGroupItem>
      </ToggleGroup>
    );

    await user.click(screen.getByText('A'));
    await user.click(screen.getByText('C'));
    expect(screen.getByText('A')).toHaveAttribute('data-state', 'on');
    expect(screen.getByText('B')).toHaveAttribute('data-state', 'off');
    expect(screen.getByText('C')).toHaveAttribute('data-state', 'on');
  });

  it('calls onValueChange when selection changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single" onValueChange={onChange}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>
    );

    await user.click(screen.getByText('A'));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('renders disabled item', () => {
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a" disabled>
          A
        </ToggleGroupItem>
      </ToggleGroup>
    );
    expect(screen.getByText('A')).toBeDisabled();
  });
});

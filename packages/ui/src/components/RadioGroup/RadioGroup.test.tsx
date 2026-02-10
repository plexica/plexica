import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './RadioGroup';

describe('RadioGroup', () => {
  it('renders without crashing', () => {
    render(
      <RadioGroup data-testid="radio-group">
        <RadioGroupItem value="a" />
      </RadioGroup>
    );
    expect(screen.getByTestId('radio-group')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <RadioGroup data-testid="radio-group" className="custom-group">
        <RadioGroupItem value="a" />
      </RadioGroup>
    );
    expect(screen.getByTestId('radio-group')).toHaveClass('custom-group');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <RadioGroup ref={ref}>
        <RadioGroupItem value="a" />
      </RadioGroup>
    );
    expect(ref).toHaveBeenCalled();
  });

  it('renders multiple radio items', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="option1" />
        <RadioGroupItem value="option2" />
        <RadioGroupItem value="option3" />
      </RadioGroup>
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('selects an item on click', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup defaultValue="">
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>
    );
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);
    expect(radios[1]).toBeChecked();
  });

  it('calls onValueChange when selection changes', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RadioGroup onValueChange={handleChange}>
        <RadioGroupItem value="first" />
        <RadioGroupItem value="second" />
      </RadioGroup>
    );
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);
    expect(handleChange).toHaveBeenCalledWith('second');
  });
});

describe('RadioGroupItem', () => {
  it('renders as a radio button', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" />
      </RadioGroup>
    );
    expect(screen.getByRole('radio')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="test" className="custom-item" />
      </RadioGroup>
    );
    expect(screen.getByRole('radio')).toHaveClass('custom-item');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <RadioGroup>
        <RadioGroupItem ref={ref} value="test" />
      </RadioGroup>
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
  });
});

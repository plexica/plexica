import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from './Form';

describe('Form', () => {
  it('renders a form element', () => {
    render(<Form data-testid="form" />);
    expect(screen.getByTestId('form').tagName).toBe('FORM');
  });

  it('applies default spacing class', () => {
    render(<Form data-testid="form" />);
    expect(screen.getByTestId('form')).toHaveClass('space-y-6');
  });

  it('applies custom className', () => {
    render(<Form data-testid="form" className="my-form" />);
    expect(screen.getByTestId('form')).toHaveClass('my-form');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLFormElement>();
    render(<Form ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLFormElement);
  });

  it('passes through form attributes', () => {
    render(<Form data-testid="form" action="/submit" method="post" />);
    const form = screen.getByTestId('form');
    expect(form).toHaveAttribute('action', '/submit');
    expect(form).toHaveAttribute('method', 'post');
  });
});

describe('FormItem', () => {
  it('renders children', () => {
    render(
      <FormItem>
        <span>Field content</span>
      </FormItem>
    );
    expect(screen.getByText('Field content')).toBeInTheDocument();
  });

  it('applies default spacing class', () => {
    render(<FormItem data-testid="item" />);
    expect(screen.getByTestId('item')).toHaveClass('space-y-2');
  });

  it('applies custom className', () => {
    render(<FormItem data-testid="item" className="my-item" />);
    expect(screen.getByTestId('item')).toHaveClass('my-item');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<FormItem ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('FormField + FormLabel', () => {
  it('renders a label associated with the field id', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input type="email" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    const label = screen.getByText('Email');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for');
  });

  it('applies error styling to label when field has error', () => {
    render(
      <FormField name="email" error="Required">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input type="email" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Email')).toHaveClass('text-destructive');
  });

  it('does not apply error styling when no error', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input type="email" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Email')).not.toHaveClass('text-destructive');
  });
});

describe('FormControl', () => {
  it('passes id and name to child input', () => {
    render(
      <FormField name="username">
        <FormItem>
          <FormControl>
            <input data-testid="input" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    const input = screen.getByTestId('input');
    expect(input).toHaveAttribute('id');
    expect(input).toHaveAttribute('name', 'username');
  });

  it('sets aria-invalid when field has error', () => {
    render(
      <FormField name="email" error="Required">
        <FormItem>
          <FormControl>
            <input data-testid="input" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby when field has error', () => {
    render(
      <FormField name="email" error="Required">
        <FormItem>
          <FormControl>
            <input data-testid="input" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(screen.getByTestId('input')).toHaveAttribute('aria-describedby');
  });

  it('does not set aria-invalid when no error', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormControl>
            <input data-testid="input" />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(screen.getByTestId('input')).not.toHaveAttribute('aria-invalid');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <FormField name="email">
        <FormItem>
          <FormControl ref={ref}>
            <input />
          </FormControl>
        </FormItem>
      </FormField>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('FormDescription', () => {
  it('renders description text', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormDescription>Helper text</FormDescription>
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Helper text')).toBeInTheDocument();
  });

  it('applies muted text styling', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormDescription data-testid="desc">Help</FormDescription>
        </FormItem>
      </FormField>
    );
    expect(screen.getByTestId('desc')).toHaveClass('text-muted-foreground');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLParagraphElement>();
    render(<FormDescription ref={ref}>Text</FormDescription>);
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
  });
});

describe('FormMessage', () => {
  it('renders error from field context', () => {
    render(
      <FormField name="email" error="Email is required">
        <FormItem>
          <FormMessage />
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Email is required')).toBeInTheDocument();
  });

  it('renders override error prop over context error', () => {
    render(
      <FormField name="email" error="Context error">
        <FormItem>
          <FormMessage error="Override error" />
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Override error')).toBeInTheDocument();
    expect(screen.queryByText('Context error')).not.toBeInTheDocument();
  });

  it('renders children when no error', () => {
    render(
      <FormField name="email">
        <FormItem>
          <FormMessage>Custom child message</FormMessage>
        </FormItem>
      </FormField>
    );
    expect(screen.getByText('Custom child message')).toBeInTheDocument();
  });

  it('returns null when no error and no children', () => {
    const { container } = render(
      <FormField name="email">
        <FormItem>
          <FormMessage data-testid="msg" />
        </FormItem>
      </FormField>
    );
    expect(container.querySelector('[data-testid="msg"]')).toBeNull();
  });

  it('has role="alert"', () => {
    render(
      <FormField name="email" error="Error">
        <FormItem>
          <FormMessage />
        </FormItem>
      </FormField>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies destructive text styling', () => {
    render(
      <FormField name="email" error="Error">
        <FormItem>
          <FormMessage data-testid="msg" />
        </FormItem>
      </FormField>
    );
    expect(screen.getByTestId('msg')).toHaveClass('text-destructive');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLParagraphElement>();
    render(
      <FormField name="email" error="Error">
        <FormItem>
          <FormMessage ref={ref} />
        </FormItem>
      </FormField>
    );
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
  });
});

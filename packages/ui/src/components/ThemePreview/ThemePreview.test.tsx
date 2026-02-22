// File: packages/ui/src/components/ThemePreview/ThemePreview.test.tsx
// T001-27: Unit tests for ThemePreview component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemePreview } from './ThemePreview';

describe('ThemePreview', () => {
  it('renders with role="img" and accessible label', () => {
    render(<ThemePreview />);
    expect(screen.getByRole('img', { name: /theme preview/i })).toBeInTheDocument();
  });

  it('renders with default theme when no props provided', () => {
    const { container } = render(<ThemePreview />);
    // Default primary color applied via CSS custom property
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle({ '--tp-primary': '#2563eb' });
  });

  it('applies custom primaryColor via CSS custom property', () => {
    const { container } = render(<ThemePreview primaryColor="#e11d48" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle({ '--tp-primary': '#e11d48' });
  });

  it('applies custom secondaryColor and accentColor', () => {
    const { container } = render(<ThemePreview secondaryColor="#f8fafc" accentColor="#7c3aed" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle({ '--tp-secondary': '#f8fafc' });
    expect(root).toHaveStyle({ '--tp-accent': '#7c3aed' });
  });

  it('renders logo img when logoUrl is provided', () => {
    render(<ThemePreview logoUrl="https://example.com/logo.png" />);
    const logoImg = screen.getByRole('img', { name: /logo/i });
    expect(logoImg).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('shows placeholder when no logoUrl is provided', () => {
    render(<ThemePreview />);
    // No logo img, placeholder div with "P" text
    expect(screen.queryByRole('img', { name: /logo/i })).toBeNull();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('injects scoped custom CSS when customCss is provided', () => {
    const { container } = render(<ThemePreview customCss="color: red;" />);
    const styleEl = container.querySelector('style');
    expect(styleEl).toBeInTheDocument();
    expect(styleEl?.textContent).toContain('color: red;');
  });
});

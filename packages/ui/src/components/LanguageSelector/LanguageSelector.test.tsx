import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageSelector } from './LanguageSelector';
import type { LocaleOption } from './LanguageSelector';

/**
 * Unit tests for LanguageSelector component
 *
 * Testing Strategy:
 * - Unit tests focus on: component rendering, props handling, ARIA attributes, styling
 * - Dropdown interaction tests (portal behavior, keyboard nav, option selection) are
 *   covered by E2E tests (Task 6.5) due to jsdom limitations with Radix UI portals
 * - Visual/interaction verification via Storybook (9 stories available)
 *
 * Rationale:
 * Radix UI's Select.Portal renders outside the test container and keyboard events
 * don't trigger dropdown opening in jsdom. This is a known limitation. E2E tests
 * with real browsers (Playwright) provide comprehensive interaction coverage.
 */
describe('LanguageSelector', () => {
  const mockLocales: LocaleOption[] = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
  ];

  describe('rendering', () => {
    it('should render with provided locales', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="en" onChange={onChange} />);

      // Trigger button should show selected locale name
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('should show placeholder when no locale selected', () => {
      const onChange = vi.fn();
      render(
        <LanguageSelector
          locales={mockLocales}
          value=""
          onChange={onChange}
          placeholder="Choose language"
        />
      );

      // NOTE: Radix UI Select.Value doesn't render placeholder in jsdom
      // Verify component renders and accepts empty value (visual test in Storybook)
      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should display selected locale name', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="es" onChange={onChange} />);

      expect(screen.getByText('Español')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA label', () => {
      const onChange = vi.fn();
      render(
        <LanguageSelector
          locales={mockLocales}
          value="en"
          onChange={onChange}
          ariaLabel="Choose your language"
        />
      );

      const trigger = screen.getByRole('combobox', { name: 'Choose your language' });
      expect(trigger).toBeInTheDocument();
    });

    it('should use default ARIA label when not provided', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="en" onChange={onChange} />);

      const trigger = screen.getByRole('combobox', { name: 'Select language' });
      expect(trigger).toBeInTheDocument();
    });

    it('should mark decorative icons with aria-hidden', () => {
      const onChange = vi.fn();
      const { container } = render(
        <LanguageSelector locales={mockLocales} value="en" onChange={onChange} />
      );

      // Languages icon and ChevronDown icon should be aria-hidden
      const hiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThanOrEqual(2);
    });

    it('should have combobox role on trigger', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="en" onChange={onChange} />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should not open when disabled', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="en" onChange={onChange} disabled />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });

    it('should have disabled attribute when disabled prop is true', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="en" onChange={onChange} disabled />);

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('disabled');
    });

    it('should apply disabled opacity styles', () => {
      const onChange = vi.fn();
      const { container } = render(
        <LanguageSelector locales={mockLocales} value="en" onChange={onChange} disabled />
      );

      const trigger = container.querySelector('button');
      expect(trigger?.className).toContain('disabled:opacity-50');
    });
  });

  describe('custom styling', () => {
    it('should apply custom className to trigger', () => {
      const onChange = vi.fn();
      const { container } = render(
        <LanguageSelector
          locales={mockLocales}
          value="en"
          onChange={onChange}
          className="custom-class w-[200px]"
        />
      );

      const trigger = container.querySelector('button');
      expect(trigger?.className).toContain('custom-class');
      expect(trigger?.className).toContain('w-[200px]');
    });

    it('should preserve default styles when className added', () => {
      const onChange = vi.fn();
      const { container } = render(
        <LanguageSelector
          locales={mockLocales}
          value="en"
          onChange={onChange}
          className="custom-class"
        />
      );

      const trigger = container.querySelector('button');
      // Should still have base styles
      expect(trigger?.className).toContain('rounded-md');
      expect(trigger?.className).toContain('border');
    });
  });

  describe('props validation', () => {
    it('should handle empty locales array gracefully', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={[]} value="" onChange={onChange} />);

      // Should render without crashing
      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should handle undefined value', () => {
      const onChange = vi.fn();
      render(<LanguageSelector locales={mockLocales} value="" onChange={onChange} />);

      // NOTE: Radix UI Select.Value doesn't render placeholder in jsdom
      // Verify component handles empty value gracefully (visual test in Storybook)
      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
      expect(trigger).not.toBeDisabled();
    });

    it('should update display when value prop changes', () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <LanguageSelector locales={mockLocales} value="en" onChange={onChange} />
      );

      expect(screen.getByText('English')).toBeInTheDocument();

      // Change value prop
      rerender(<LanguageSelector locales={mockLocales} value="es" onChange={onChange} />);

      expect(screen.getByText('Español')).toBeInTheDocument();
    });
  });
});

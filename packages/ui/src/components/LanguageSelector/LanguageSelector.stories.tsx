import type { Meta, StoryObj } from '@storybook/react';
import { LanguageSelector } from './LanguageSelector';
import type { LocaleOption } from './LanguageSelector';

const meta: Meta<typeof LanguageSelector> = {
  title: 'Components/LanguageSelector',
  component: LanguageSelector,
  tags: ['autodocs'],
  argTypes: {
    locales: {
      description: 'Array of available locales to display',
      control: { type: 'object' },
    },
    value: {
      description: 'Currently selected locale code',
      control: { type: 'text' },
    },
    onChange: {
      description: 'Callback when locale is changed',
      action: 'onChange',
    },
    disabled: {
      description: 'Whether the selector is disabled',
      control: { type: 'boolean' },
    },
    className: {
      description: 'Additional CSS classes',
      control: { type: 'text' },
    },
    placeholder: {
      description: 'Placeholder text when no locale selected',
      control: { type: 'text' },
    },
    ariaLabel: {
      description: 'ARIA label for accessibility',
      control: { type: 'text' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LanguageSelector>;

// Common locale data for stories
const commonLocales: LocaleOption[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
];

const manyLocales: LocaleOption[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ko', name: '한국어' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
];

/**
 * Default state with 5 common locales.
 * Click to open the dropdown and select a language.
 */
export const Default: Story = {
  args: {
    locales: commonLocales,
    value: 'en',
    placeholder: 'Select language',
    ariaLabel: 'Select language',
  },
};

/**
 * Spanish locale selected.
 * Demonstrates how the component displays the selected language name.
 */
export const SpanishSelected: Story = {
  args: {
    locales: commonLocales,
    value: 'es',
  },
};

/**
 * Many locales (15+) with scrolling.
 * Tests the component with a large number of languages.
 */
export const ManyLocales: Story = {
  args: {
    locales: manyLocales,
    value: 'en',
  },
};

/**
 * Disabled state.
 * The component cannot be interacted with.
 */
export const Disabled: Story = {
  args: {
    locales: commonLocales,
    value: 'en',
    disabled: true,
  },
};

/**
 * No locale selected (placeholder shown).
 * Demonstrates the initial state before a user makes a selection.
 */
export const NoSelection: Story = {
  args: {
    locales: commonLocales,
    value: '',
    placeholder: 'Choose your language',
  },
};

/**
 * Empty locales array.
 * Shows the fallback message when no languages are available.
 */
export const EmptyLocales: Story = {
  args: {
    locales: [],
    value: '',
    placeholder: 'No languages available',
  },
};

/**
 * Custom styling with className.
 * Demonstrates how to apply custom styles to the component.
 */
export const CustomStyling: Story = {
  args: {
    locales: commonLocales,
    value: 'fr',
    className: 'w-[200px] border-2 border-primary',
  },
};

/**
 * Compact width.
 * Useful for navigation bars or toolbars.
 */
export const CompactWidth: Story = {
  args: {
    locales: commonLocales,
    value: 'de',
    className: 'w-[140px]',
  },
};

/**
 * Full width.
 * Useful for form fields or settings pages.
 */
export const FullWidth: Story = {
  args: {
    locales: commonLocales,
    value: 'it',
    className: 'w-full',
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
};

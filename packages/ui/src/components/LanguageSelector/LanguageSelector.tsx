import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Locale option for the language selector
 */
export interface LocaleOption {
  /** BCP 47 locale code (e.g., 'en', 'en-US', 'es', 'fr') */
  code: string;
  /** Native language name (e.g., 'English', 'Español', 'Français') */
  name: string;
}

export interface LanguageSelectorProps {
  /** Array of available locales to display */
  locales: LocaleOption[];
  /** Currently selected locale code */
  value: string;
  /** Callback when locale is changed */
  onChange: (localeCode: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Placeholder text when no locale selected */
  placeholder?: string;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}

/**
 * LanguageSelector: Reusable dropdown component for selecting user locale
 *
 * Features:
 * - Built on @radix-ui/react-select for accessibility
 * - Displays locales with native language names (no flags for WCAG compliance)
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Proper ARIA attributes for screen readers
 * - Consistent styling with @plexica/ui design system
 *
 * @example
 * ```tsx
 * <LanguageSelector
 *   locales={[
 *     { code: 'en', name: 'English' },
 *     { code: 'es', name: 'Español' },
 *     { code: 'fr', name: 'Français' }
 *   ]}
 *   value={locale}
 *   onChange={(code) => setLocale(code)}
 * />
 * ```
 */
export function LanguageSelector({
  locales,
  value,
  onChange,
  disabled = false,
  className,
  placeholder = 'Select language',
  ariaLabel = 'Select language',
}: LanguageSelectorProps) {
  // Find the currently selected locale to display its name
  const selectedLocale = locales.find((locale) => locale.code === value);

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'hover:bg-accent hover:text-accent-foreground',
          'transition-colors',
          className
        )}
        aria-label={ariaLabel}
      >
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 opacity-70" aria-hidden="true" />
          <SelectPrimitive.Value>
            {selectedLocale ? selectedLocale.name : placeholder}
          </SelectPrimitive.Value>
        </div>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            'relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
          )}
          position="popper"
          sideOffset={5}
        >
          <SelectPrimitive.Viewport
            className={cn(
              'p-1',
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
              // Support scrolling for many locales
              'max-h-[300px] overflow-y-auto'
            )}
          >
            {locales.map((locale) => (
              <SelectPrimitive.Item
                key={locale.code}
                value={locale.code}
                className={cn(
                  'relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none',
                  'focus:bg-accent focus:text-accent-foreground',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  'transition-colors'
                )}
              >
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{locale.name}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}

            {locales.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No languages available
              </div>
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

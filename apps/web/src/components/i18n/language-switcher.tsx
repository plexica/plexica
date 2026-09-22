// components/i18n/language-switcher.tsx
// EN/IT language switcher (006-07). Radix DropdownMenu in the header; updates
// the store optimistically and syncs `user_profile.language` via PATCH /profile
// (see hooks/use-locale.ts). No page reload — the IntlMessageProvider re-renders
// in place.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Languages } from 'lucide-react';
import { useIntl } from 'react-intl';

import { useLocale } from '../../hooks/use-locale.js';
import { SUPPORTED_LOCALES, type LocaleCode } from '../../i18n/locales.js';

export function LanguageSwitcher(): JSX.Element {
  const intl = useIntl();
  const { locale, setLocale } = useLocale();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'language.switcher.label' })}
          data-testid="language-switcher-trigger"
          className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <Languages className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[140px] rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {SUPPORTED_LOCALES.map((code) => (
            <DropdownMenu.Item
              key={code}
              onSelect={() => setLocale(code as LocaleCode)}
              className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-50 focus:bg-neutral-50"
            >
              <span>{intl.formatMessage({ id: `language.${code}` })}</span>
              {code === locale && <Check className="h-4 w-4" aria-hidden="true" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
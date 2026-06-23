// tabs.tsx — Tabs component
// Built on @radix-ui/react-tabs
// WCAG 2.1 AA: keyboard navigation handled by Radix, aria-tablist/aria-tab

import * as React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';

import { cn } from '../lib/cn.js';

export interface TabDef {
  value: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: TabDef[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
  className,
}: TabsProps): React.JSX.Element {
  const resolvedDefault = defaultValue ?? tabs[0]?.value;

  return (
    <RadixTabs.Root
      {...(resolvedDefault !== undefined ? { defaultValue: resolvedDefault } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange !== undefined ? { onValueChange } : {})}
      className={cn('flex flex-col', className)}
    >
      <RadixTabs.List className="flex border-b border-neutral-200" aria-label="Tabs">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'px-4 py-2 text-sm font-medium text-neutral-600 transition-colors',
              'border-b-2 border-transparent -mb-px',
              'hover:text-neutral-900',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset',
              'data-[state=active]:border-primary-600 data-[state=active]:text-primary-700'
            )}
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {tabs.map((tab) => (
        <RadixTabs.Content
          key={tab.value}
          value={tab.value}
          className="pt-4 focus-visible:outline-none"
        >
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

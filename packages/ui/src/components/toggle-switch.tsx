// toggle-switch.tsx — ToggleSwitch component
// Built on @radix-ui/react-switch
// WCAG 2.1 AA: visible focus ring, aria-checked handled by Radix

import * as React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';

import { cn } from '../lib/cn.js';

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  id,
}: ToggleSwitchProps): React.JSX.Element {
  const generatedId = React.useId();
  const switchId = id ?? generatedId;

  return (
    <div className="flex items-center gap-3">
      <RadixSwitch.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          checked ? 'bg-primary-600' : 'bg-neutral-300',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </RadixSwitch.Root>
      <label
        htmlFor={switchId}
        className={cn(
          'text-sm font-medium text-neutral-700 select-none',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {label}
      </label>
    </div>
  );
}

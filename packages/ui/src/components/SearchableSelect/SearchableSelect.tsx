// File: packages/ui/src/components/SearchableSelect/SearchableSelect.tsx

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../Select/Select';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * SearchableSelect component - A select dropdown with options
 * This is a simplified select that takes an array of options
 * Full search functionality can be added in future iterations
 */
export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  ({ value, onChange, options, placeholder = 'Select...', disabled = false, className }, ref) => {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger ref={ref} className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';

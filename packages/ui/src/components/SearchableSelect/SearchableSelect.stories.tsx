// File: packages/ui/src/components/SearchableSelect/SearchableSelect.stories.tsx

import type { Meta, StoryObj } from '@storybook/react';
import { SearchableSelect } from './SearchableSelect';
import { useState } from 'react';

const meta: Meta<typeof SearchableSelect> = {
  title: 'Form/SearchableSelect',
  component: SearchableSelect,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A select dropdown component that accepts an array of options.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SearchableSelect>;

const roles = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
];

const countries = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'it', label: 'Italy' },
  { value: 'es', label: 'Spain' },
];

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('MEMBER');
    return (
      <div className="w-[200px]">
        <SearchableSelect
          value={value}
          onChange={setValue}
          options={roles}
          placeholder="Select role"
        />
      </div>
    );
  },
};

export const WithManyOptions: Story = {
  render: () => {
    const [value, setValue] = useState('us');
    return (
      <div className="w-[200px]">
        <SearchableSelect
          value={value}
          onChange={setValue}
          options={countries}
          placeholder="Select country"
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => {
    const [value, setValue] = useState('ADMIN');
    return (
      <div className="w-[200px]">
        <SearchableSelect
          value={value}
          onChange={setValue}
          options={roles}
          placeholder="Select role"
          disabled
        />
      </div>
    );
  },
};

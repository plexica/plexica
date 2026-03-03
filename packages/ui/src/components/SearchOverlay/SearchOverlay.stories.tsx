// File: packages/ui/src/components/SearchOverlay/SearchOverlay.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchOverlay, type SearchResultItem } from './SearchOverlay';

const meta: Meta<typeof SearchOverlay> = {
  title: 'Components/SearchOverlay',
  component: SearchOverlay,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof SearchOverlay>;

const MOCK_RESULTS: SearchResultItem[] = [
  {
    id: '1',
    title: 'Acme Corp Contact',
    type: 'crm:contact',
    snippet: 'CEO at Acme Corp, joined 2024',
  },
  { id: '2', title: 'Q4 Sales Report', type: 'workspace:page', snippet: 'Revenue up 23% YoY…' },
  {
    id: '3',
    title: 'Plugin Marketplace',
    type: 'system:page',
    snippet: 'Browse and install plugins',
  },
];

export const WithResults: Story = {
  args: {
    open: true,
    placeholder: 'Search everywhere…',
    recentSearches: ['tenant settings', 'plugin install'],
    onSearch: async () => MOCK_RESULTS,
    onSelect: (item) => alert(`Selected: ${item.title}`),
    onClose: () => {},
  },
};

export const WithRecentSearches: Story = {
  args: {
    open: true,
    recentSearches: ['dashboard', 'user roles', 'billing'],
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: { open: true, onClose: () => {} },
};

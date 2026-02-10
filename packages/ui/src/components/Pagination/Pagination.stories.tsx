import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Components/Pagination',
  component: Pagination,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
  args: {
    page: 1,
    totalPages: 10,
    onPageChange: () => {},
  },
};

export const MiddlePage: Story = {
  args: {
    page: 5,
    totalPages: 10,
    onPageChange: () => {},
  },
};

export const LastPage: Story = {
  args: {
    page: 10,
    totalPages: 10,
    onPageChange: () => {},
  },
};

export const FewPages: Story = {
  args: {
    page: 2,
    totalPages: 3,
    onPageChange: () => {},
  },
};

export const ManyPages: Story = {
  args: {
    page: 15,
    totalPages: 50,
    onPageChange: () => {},
  },
};

export const WithoutFirstLast: Story = {
  args: {
    page: 5,
    totalPages: 20,
    onPageChange: () => {},
    showFirstLast: false,
  },
};

export const SinglePage: Story = {
  args: {
    page: 1,
    totalPages: 1,
    onPageChange: () => {},
  },
};

export const Interactive: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Current page: {page}</p>
        <Pagination page={page} totalPages={20} onPageChange={setPage} />
      </div>
    );
  },
};

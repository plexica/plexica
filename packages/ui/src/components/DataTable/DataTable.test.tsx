import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './DataTable';
import type { ColumnDef } from '@tanstack/react-table';

interface TestRow {
  id: number;
  name: string;
  email: string;
}

const testColumns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
];

const testData: TestRow[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' },
];

const generateRows = (count: number): TestRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
  }));

describe('DataTable', () => {
  it('renders without crashing', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders correct number of rows', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    const table = screen.getByRole('table');
    // 1 header row + 3 data rows
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
  });

  it('applies custom className', () => {
    const { container } = render(
      <DataTable columns={testColumns} data={testData} className="my-table" />
    );
    expect(container.firstElementChild).toHaveClass('my-table');
  });

  it('renders empty state when data is empty', () => {
    render(<DataTable columns={testColumns} data={[]} />);
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    render(<DataTable columns={testColumns} data={[]} isLoading />);
    // Loading spinner: an element with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    // Should not show "No results." when loading
    expect(screen.queryByText('No results.')).not.toBeInTheDocument();
  });

  it('renders search input when enableGlobalFilter is true', () => {
    render(<DataTable columns={testColumns} data={testData} enableGlobalFilter />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('does not render search input when enableGlobalFilter is false', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('filters data when typing in the global filter', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={testColumns} data={testData} enableGlobalFilter />);

    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Alice');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('renders pagination controls when enablePagination is true', () => {
    render(<DataTable columns={testColumns} data={testData} enablePagination pageSize={2} />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('does not render pagination controls when enablePagination is false', () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('paginates data correctly', async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(5);
    render(<DataTable columns={testColumns} data={manyRows} enablePagination pageSize={2} />);

    // First page: 2 data rows
    const table = screen.getByRole('table');
    const dataRows = within(table).getAllByRole('row');
    // 1 header + 2 data rows
    expect(dataRows).toHaveLength(3);
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 2')).toBeInTheDocument();

    // Page info
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

    // Navigate to next page
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('User 3')).toBeInTheDocument();
    expect(screen.getByText('User 4')).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it('disables Previous button on first page', () => {
    render(<DataTable columns={testColumns} data={testData} enablePagination pageSize={2} />);
    const prevButton = screen.getByText('Previous').closest('button');
    expect(prevButton).toBeDisabled();
  });

  it('disables Next button on last page', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={testColumns} data={testData} enablePagination pageSize={2} />);

    // Navigate to last page
    await user.click(screen.getByText('Next'));
    // 3 rows total, pageSize 2 = 2 pages. We're on page 2 now (last).
    const nextButton = screen.getByText('Next').closest('button');
    expect(nextButton).toBeDisabled();
  });
});

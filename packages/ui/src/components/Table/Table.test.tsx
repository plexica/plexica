import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './Table';

describe('Table', () => {
  it('renders without crashing', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Table className="custom-table">
        <TableBody>
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole('table')).toHaveClass('custom-table');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table ref={ref}>
        <TableBody>
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableElement);
  });

  it('wraps table in an overflow container', () => {
    render(
      <Table data-testid="my-table">
        <TableBody>
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('relative', 'w-full', 'overflow-auto');
  });
});

describe('TableHeader', () => {
  it('renders a thead element', () => {
    render(
      <Table>
        <TableHeader data-testid="thead">
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('thead').tagName).toBe('THEAD');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableHeader ref={ref}>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('TableBody', () => {
  it('renders a tbody element', () => {
    render(
      <Table>
        <TableBody data-testid="tbody">
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('tbody').tagName).toBe('TBODY');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableBody ref={ref}>
          <TableRow>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('TableRow', () => {
  it('renders a tr element', () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('row').tagName).toBe('TR');
  });

  it('applies custom className', () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row" className="custom-row">
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('row')).toHaveClass('custom-row');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableBody>
          <TableRow ref={ref}>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableRowElement);
  });
});

describe('TableHead', () => {
  it('renders a th element', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
    expect(screen.getByRole('columnheader')).toHaveTextContent('Column');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead ref={ref}>Col</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableCellElement);
  });
});

describe('TableCell', () => {
  it('renders a td element', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Value</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole('cell')).toHaveTextContent('Value');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell ref={ref}>Value</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableCellElement);
  });
});

describe('TableFooter', () => {
  it('renders a tfoot element', () => {
    render(
      <Table>
        <TableFooter data-testid="tfoot">
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );
    expect(screen.getByTestId('tfoot').tagName).toBe('TFOOT');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableFooter ref={ref}>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('TableCaption', () => {
  it('renders a caption element', () => {
    render(
      <Table>
        <TableCaption>A list of users</TableCaption>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByText('A list of users')).toBeInTheDocument();
    expect(screen.getByText('A list of users').tagName).toBe('CAPTION');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Table>
        <TableCaption ref={ref}>Caption</TableCaption>
      </Table>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('Table composition', () => {
  it('renders a complete table with all subcomponents', () => {
    render(
      <Table>
        <TableCaption>User list</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>alice@example.com</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bob</TableCell>
            <TableCell>bob@example.com</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>2 users</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('User list')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('2 users')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header, HeaderLeft, HeaderCenter, HeaderRight, HeaderLogo } from './Header';

describe('Header', () => {
  it('renders without crashing', () => {
    render(<Header>Content</Header>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders a header element', () => {
    render(<Header>Content</Header>);
    const header = screen.getByRole('banner');
    expect(header.tagName).toBe('HEADER');
  });

  it('applies sticky positioning classes', () => {
    render(<Header>Content</Header>);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('sticky', 'top-0');
  });

  it('applies custom className', () => {
    render(<Header className="custom-header">Content</Header>);
    expect(screen.getByRole('banner')).toHaveClass('custom-header');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Header ref={ref}>Content</Header>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('renders children', () => {
    render(<Header>Header content</Header>);
    expect(screen.getByText('Header content')).toBeInTheDocument();
  });
});

describe('HeaderLeft', () => {
  it('renders children', () => {
    render(<HeaderLeft>Left content</HeaderLeft>);
    expect(screen.getByText('Left content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <HeaderLeft data-testid="left" className="custom-left">
        Left
      </HeaderLeft>
    );
    expect(screen.getByTestId('left')).toHaveClass('custom-left');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<HeaderLeft ref={ref}>Left</HeaderLeft>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('HeaderCenter', () => {
  it('renders children', () => {
    render(<HeaderCenter>Center content</HeaderCenter>);
    expect(screen.getByText('Center content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <HeaderCenter data-testid="center" className="custom-center">
        Center
      </HeaderCenter>
    );
    expect(screen.getByTestId('center')).toHaveClass('custom-center');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<HeaderCenter ref={ref}>Center</HeaderCenter>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('HeaderRight', () => {
  it('renders children', () => {
    render(<HeaderRight>Right content</HeaderRight>);
    expect(screen.getByText('Right content')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<HeaderRight ref={ref}>Right</HeaderRight>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('HeaderLogo', () => {
  it('renders children', () => {
    render(<HeaderLogo>Plexica</HeaderLogo>);
    expect(screen.getByText('Plexica')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <HeaderLogo data-testid="logo" className="custom-logo">
        Logo
      </HeaderLogo>
    );
    expect(screen.getByTestId('logo')).toHaveClass('custom-logo');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<HeaderLogo ref={ref}>Logo</HeaderLogo>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });

  it('has cursor-pointer class', () => {
    render(<HeaderLogo data-testid="logo">Logo</HeaderLogo>);
    expect(screen.getByTestId('logo')).toHaveClass('cursor-pointer');
  });
});

describe('Header composition', () => {
  it('renders a full header layout', () => {
    render(
      <Header>
        <HeaderLeft>
          <HeaderLogo>Plexica</HeaderLogo>
        </HeaderLeft>
        <HeaderCenter>Search</HeaderCenter>
        <HeaderRight>Profile</HeaderRight>
      </Header>
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Plexica')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});

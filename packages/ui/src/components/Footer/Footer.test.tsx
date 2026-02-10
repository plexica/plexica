import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer, FooterLeft, FooterCenter, FooterRight } from './Footer';

describe('Footer', () => {
  it('renders without crashing', () => {
    render(<Footer>Content</Footer>);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders a footer element', () => {
    render(<Footer>Content</Footer>);
    expect(screen.getByRole('contentinfo').tagName).toBe('FOOTER');
  });

  it('applies custom className', () => {
    render(<Footer className="custom-footer">Content</Footer>);
    expect(screen.getByRole('contentinfo')).toHaveClass('custom-footer');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Footer ref={ref}>Content</Footer>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('renders children', () => {
    render(<Footer>Footer content</Footer>);
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('applies base classes', () => {
    render(<Footer>Content</Footer>);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('border-t', 'bg-background', 'h-12', 'flex', 'items-center');
  });

  it('passes through HTML attributes', () => {
    render(
      <Footer id="main-footer" aria-label="Site footer">
        Content
      </Footer>
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveAttribute('id', 'main-footer');
    expect(footer).toHaveAttribute('aria-label', 'Site footer');
  });
});

describe('FooterLeft', () => {
  it('renders children', () => {
    render(<FooterLeft>Left content</FooterLeft>);
    expect(screen.getByText('Left content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <FooterLeft data-testid="left" className="custom-left">
        Left
      </FooterLeft>
    );
    expect(screen.getByTestId('left')).toHaveClass('custom-left');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<FooterLeft ref={ref}>Left</FooterLeft>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('FooterCenter', () => {
  it('renders children', () => {
    render(<FooterCenter>Center content</FooterCenter>);
    expect(screen.getByText('Center content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <FooterCenter data-testid="center" className="custom-center">
        Center
      </FooterCenter>
    );
    expect(screen.getByTestId('center')).toHaveClass('custom-center');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<FooterCenter ref={ref}>Center</FooterCenter>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('FooterRight', () => {
  it('renders children', () => {
    render(<FooterRight>Right content</FooterRight>);
    expect(screen.getByText('Right content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <FooterRight data-testid="right" className="custom-right">
        Right
      </FooterRight>
    );
    expect(screen.getByTestId('right')).toHaveClass('custom-right');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<FooterRight ref={ref}>Right</FooterRight>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('Footer composition', () => {
  it('renders a full footer layout', () => {
    render(
      <Footer>
        <FooterLeft>Copyright 2026</FooterLeft>
        <FooterCenter>Plexica</FooterCenter>
        <FooterRight>v1.0</FooterRight>
      </Footer>
    );
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText('Copyright 2026')).toBeInTheDocument();
    expect(screen.getByText('Plexica')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
  });
});

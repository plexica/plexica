// apps/web/src/__tests__/layout/PluginNotFoundPage.test.tsx
//
// Unit tests for T005-04: PluginNotFoundPage component

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock TanStack Router's useNavigate
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

import { PluginNotFoundPage } from '../../components/PluginNotFoundPage';

describe('PluginNotFoundPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the "Page Not Found" h1 heading and default explanatory text', () => {
    render(<PluginNotFoundPage />);
    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/not available for your organization/i)).toBeInTheDocument();
  });

  it('navigates to "/" when the "Go to Dashboard" button is clicked', () => {
    render(<PluginNotFoundPage />);
    const btn = screen.getByRole('button', { name: /return to dashboard/i });
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('renders a custom message when the message prop is provided', () => {
    const custom = 'Custom error message for test';
    render(<PluginNotFoundPage message={custom} />);
    expect(screen.getByText(custom)).toBeInTheDocument();
    // Default message should NOT be present
    expect(screen.queryByText(/not available for your organization/i)).not.toBeInTheDocument();
  });
});

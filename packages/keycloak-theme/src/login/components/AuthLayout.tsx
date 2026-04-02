import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  headerNode?: ReactNode;
  footerNode?: ReactNode;
};

export function AuthLayout({ children, headerNode, footerNode }: Props) {
  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-logo">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            aria-label="Plexica"
            role="img"
          >
            <rect width="32" height="32" rx="8" fill="var(--color-primary-600)" />
            <path d="M8 22V10h8a6 6 0 0 1 0 12H8z" fill="white" />
          </svg>
          <span className="auth-logo-text">Plexica</span>
        </div>
        {headerNode !== undefined && <div className="auth-header">{headerNode}</div>}
        <div className="auth-content">{children}</div>
        {footerNode !== undefined && <div className="auth-footer">{footerNode}</div>}
      </div>
    </div>
  );
}

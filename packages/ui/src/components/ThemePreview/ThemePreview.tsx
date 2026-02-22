// File: packages/ui/src/components/ThemePreview/ThemePreview.tsx
// T001-21: Miniature app shell showing theme values in real-time per Spec 001.
//
// Features:
// - ~300×400px preview: sidebar + header + button + body text
// - CSS custom properties for colors
// - Custom CSS scoped to preview container
// - Logo loading error → placeholder
// - role="img" (decorative)

import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThemePreviewProps {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  faviconUrl?: string;
  customCss?: string;
  className?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  primaryColor: '#2563eb',
  secondaryColor: '#f1f5f9',
  accentColor: '#0ea5e9',
  fontFamily: 'system-ui, sans-serif',
};

// ─── Unique ID for scoped CSS ─────────────────────────────────────────────────

let _idCounter = 0;

function useStableId() {
  return React.useMemo(() => `theme-preview-${++_idCounter}`, []);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ThemePreview({
  primaryColor = DEFAULTS.primaryColor,
  secondaryColor = DEFAULTS.secondaryColor,
  accentColor = DEFAULTS.accentColor,
  fontFamily = DEFAULTS.fontFamily,
  logoUrl,
  customCss = '',
  className,
}: ThemePreviewProps) {
  const scopeId = useStableId();
  const [logoError, setLogoError] = React.useState(false);

  // Reset logo error when URL changes
  React.useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  const cssVars: React.CSSProperties = {
    '--tp-primary': primaryColor,
    '--tp-secondary': secondaryColor,
    '--tp-accent': accentColor,
    '--tp-font': fontFamily,
  } as React.CSSProperties;

  // Scoped custom CSS injection
  const scopedCss = customCss ? `#${scopeId} { ${customCss} }` : '';

  return (
    <div
      id={scopeId}
      role="img"
      aria-label="Theme preview"
      style={cssVars}
      className={cn(
        'w-[300px] h-[380px] rounded-lg border border-border overflow-hidden shadow-sm',
        'flex flex-col text-[10px] select-none',
        className
      )}
    >
      {/* Scoped style injection */}
      {scopedCss && (
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: scopedCss }}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ backgroundColor: 'var(--tp-primary)', fontFamily: 'var(--tp-font)' }}
      >
        {/* Logo */}
        {logoUrl && !logoError ? (
          <img
            src={logoUrl}
            alt="Logo"
            onError={() => setLogoError(true)}
            className="w-5 h-5 rounded object-contain bg-white/20"
          />
        ) : (
          <div className="w-5 h-5 rounded bg-white/30 flex items-center justify-center">
            <span className="text-white font-bold" style={{ fontSize: 8 }}>
              P
            </span>
          </div>
        )}
        <span className="text-white font-semibold truncate">Plexica</span>
        <div className="ml-auto flex gap-1">
          {['bg-white/30', 'bg-white/30', 'bg-white/30'].map((c, i) => (
            <div key={i} className={`w-12 h-2 rounded-sm ${c}`} />
          ))}
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="w-16 shrink-0 flex flex-col gap-1 p-2"
          style={{ backgroundColor: 'var(--tp-secondary)', fontFamily: 'var(--tp-font)' }}
        >
          {['Dashboard', 'Tenants', 'Plugins', 'Users', 'Settings'].map((item) => (
            <div
              key={item}
              className="rounded px-1.5 py-1 truncate"
              style={{ fontSize: 8, color: 'var(--tp-primary)' }}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-3 overflow-hidden" style={{ fontFamily: 'var(--tp-font)' }}>
          {/* Page title */}
          <div className="font-bold mb-2" style={{ color: 'var(--tp-primary)', fontSize: 10 }}>
            Dashboard
          </div>

          {/* Cards row */}
          <div className="flex gap-1.5 mb-3">
            {[
              { label: 'Tenants', val: '24' },
              { label: 'Active', val: '18' },
            ].map(({ label, val }) => (
              <div
                key={label}
                className="flex-1 rounded border p-1.5"
                style={{ borderColor: 'var(--tp-secondary)' }}
              >
                <div className="text-muted-foreground" style={{ fontSize: 7 }}>
                  {label}
                </div>
                <div className="font-bold" style={{ fontSize: 11, color: 'var(--tp-primary)' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Body text */}
          <div className="mb-3 space-y-1" style={{ color: '#555', fontSize: 7, lineHeight: 1.5 }}>
            <div className="bg-muted/40 rounded h-1.5 w-full" />
            <div className="bg-muted/40 rounded h-1.5 w-4/5" />
            <div className="bg-muted/40 rounded h-1.5 w-3/5" />
          </div>

          {/* Button */}
          <button
            type="button"
            className="rounded px-3 py-1 text-white font-medium"
            style={{
              backgroundColor: 'var(--tp-accent)',
              fontSize: 8,
              cursor: 'default',
            }}
            tabIndex={-1}
            aria-hidden="true"
          >
            New Tenant
          </button>
        </div>
      </div>
    </div>
  );
}

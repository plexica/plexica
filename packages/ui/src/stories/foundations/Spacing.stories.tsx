// File: packages/ui/src/stories/foundations/Spacing.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../styles/globals.css';

const spacingScale = [
  { name: '0.5', px: 2, tw: 'p-0.5' },
  { name: '1', px: 4, tw: 'p-1 / gap-1' },
  { name: '1.5', px: 6, tw: 'p-1.5' },
  { name: '2', px: 8, tw: 'p-2 / gap-2' },
  { name: '3', px: 12, tw: 'p-3 / gap-3' },
  { name: '4', px: 16, tw: 'p-4 / gap-4' },
  { name: '5', px: 20, tw: 'p-5' },
  { name: '6', px: 24, tw: 'p-6 / gap-6' },
  { name: '8', px: 32, tw: 'p-8 / gap-8' },
  { name: '10', px: 40, tw: 'p-10' },
  { name: '12', px: 48, tw: 'p-12 / gap-12' },
  { name: '16', px: 64, tw: 'p-16' },
];

const namedSpacing = [
  { name: 'xs', px: 4, usage: 'Minimal spacing, icon gaps' },
  { name: 'sm', px: 8, usage: 'Tight spacing, badge padding' },
  { name: 'md', px: 16, usage: 'Standard spacing, card padding' },
  { name: 'lg', px: 24, usage: 'Section spacing, card headers' },
  { name: 'xl', px: 32, usage: 'Large section spacing' },
  { name: 'xxl', px: 48, usage: 'Page-level spacing' },
];

const radiusScale = [
  { name: 'sm', formula: 'radius - 4px', tw: 'rounded-sm' },
  { name: 'md', formula: 'radius - 2px', tw: 'rounded-md' },
  { name: 'lg', formula: 'radius', tw: 'rounded-lg' },
  { name: 'xl', formula: 'radius + 4px', tw: 'rounded-xl' },
  { name: '2xl', formula: 'radius + 8px', tw: 'rounded-2xl' },
  { name: '3xl', formula: 'radius + 12px', tw: 'rounded-3xl' },
  { name: '4xl', formula: 'radius + 16px', tw: 'rounded-4xl' },
  { name: 'full', formula: '9999px', tw: 'rounded-full' },
];

function SpacingPage() {
  return (
    <div style={{ padding: '24px', fontFamily: "'JetBrains Mono Variable', monospace" }}>
      <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px' }}>Spacing & Radius</h1>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '32px' }}>
        Spacing uses Tailwind's 4px base unit. Radius is computed from a single{' '}
        <code>--radius</code> variable.
      </p>

      {/* Spacing Scale */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Spacing Scale</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {spacingScale.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: `${s.px}px`,
                  height: '24px',
                  backgroundColor: 'var(--primary)',
                  flexShrink: 0,
                }}
              />
              <code style={{ fontSize: '12px', minWidth: '120px' }}>{s.tw}</code>
              <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{s.px}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* Named Spacing */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
          Named Spacing Aliases
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Name</th>
              <th style={{ padding: '8px 12px' }}>Value</th>
              <th style={{ padding: '8px 12px' }}>Usage</th>
              <th style={{ padding: '8px 12px' }}>Preview</th>
            </tr>
          </thead>
          <tbody>
            {namedSpacing.map((s) => (
              <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <code>p-{s.name}</code>
                </td>
                <td style={{ padding: '8px 12px' }}>{s.px}px</td>
                <td style={{ padding: '8px 12px', color: 'var(--muted-foreground)' }}>{s.usage}</td>
                <td style={{ padding: '8px 12px' }}>
                  <div
                    style={{
                      width: `${s.px}px`,
                      height: '16px',
                      backgroundColor: 'var(--chart-3)',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Border Radius */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
          Border Radius Scale
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
          Base: <code>--radius: 0</code> (sharp corners). Increase to enable rounded corners.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {radiusScale.map((r) => (
            <div key={r.name} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  backgroundColor: 'var(--primary)',
                  borderRadius: r.name === 'full' ? '9999px' : undefined,
                }}
                className={r.name !== 'full' ? r.tw : undefined}
              />
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                <code>{r.tw}</code>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{r.formula}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Shadows */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Shadows</h2>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '120px',
                height: '80px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <code style={{ fontSize: '11px' }}>shadow-sm</code>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
              Cards, elevated surfaces
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '120px',
                height: '80px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <code style={{ fontSize: '11px' }}>shadow-lg</code>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
              Modals, popovers
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: 'Foundations/Spacing & Radius',
  component: SpacingPage,
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;

type Story = StoryObj;

export const Overview: Story = {
  render: () => <SpacingPage />,
};

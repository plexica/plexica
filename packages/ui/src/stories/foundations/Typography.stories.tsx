// File: packages/ui/src/stories/foundations/Typography.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import '../../styles/globals.css';

function TypographyPage() {
  return (
    <div style={{ padding: '24px', fontFamily: "'JetBrains Mono Variable', monospace" }}>
      <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px' }}>Typography</h1>
      <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '32px' }}>
        Plexica uses <strong>JetBrains Mono Variable</strong> (monospace) as its sole typeface.
        Imported from <code>@fontsource-variable/jetbrains-mono</code>.
      </p>

      {/* Type Scale */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Type Scale</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Name</th>
              <th style={{ padding: '8px 12px' }}>Class</th>
              <th style={{ padding: '8px 12px' }}>Size</th>
              <th style={{ padding: '8px 12px' }}>Preview</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'H1', cls: 'text-h1', size: '28px / 600', text: 'Page Title' },
              { name: 'H2', cls: 'text-h2', size: '24px / 600', text: 'Section Title' },
              { name: 'H3', cls: 'text-h3', size: '20px / 600', text: 'Card Title' },
              { name: 'Base', cls: 'text-base', size: '16px / 400', text: 'Base text size' },
              {
                name: 'Body (sm)',
                cls: 'text-sm',
                size: '14px / 400',
                text: 'Standard body text used in most components',
              },
              {
                name: 'Small (xs)',
                cls: 'text-xs',
                size: '12px / 400',
                text: 'Helper text, badges, metadata',
              },
            ].map((row) => (
              <tr key={row.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px' }}>{row.name}</td>
                <td style={{ padding: '12px' }}>
                  <code
                    style={{
                      fontSize: '12px',
                      backgroundColor: 'var(--muted)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                    }}
                  >
                    {row.cls}
                  </code>
                </td>
                <td style={{ padding: '12px', color: 'var(--muted-foreground)' }}>{row.size}</td>
                <td style={{ padding: '12px' }}>
                  <span className={row.cls}>{row.text}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Font Weights */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Font Weights</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { weight: 400, name: 'Normal', cls: 'font-normal', usage: 'Body text, descriptions' },
            { weight: 500, name: 'Medium', cls: 'font-medium', usage: 'Labels, emphasis, buttons' },
            { weight: 600, name: 'Semibold', cls: 'font-semibold', usage: 'Headings, card titles' },
          ].map((w) => (
            <div key={w.weight} style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <span style={{ fontWeight: w.weight, fontSize: '18px', minWidth: '280px' }}>
                {w.name} ({w.weight}) -- {w.usage}
              </span>
              <code style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{w.cls}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Text Colors */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Text Colors</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ color: 'var(--foreground)' }}>
            <code>text-foreground</code> -- Default text (high contrast)
          </p>
          <p style={{ color: 'var(--muted-foreground)' }}>
            <code>text-muted-foreground</code> -- Secondary/subdued text
          </p>
          <p style={{ color: 'var(--primary)' }}>
            <code>text-primary</code> -- Primary-colored text (links, emphasis)
          </p>
          <p style={{ color: 'var(--destructive)' }}>
            <code>text-destructive</code> -- Error/warning text
          </p>
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: 'Foundations/Typography',
  component: TypographyPage,
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;

type Story = StoryObj;

export const TypeScale: Story = {
  render: () => <TypographyPage />,
};

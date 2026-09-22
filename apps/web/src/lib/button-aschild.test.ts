// button-aschild.test.ts
// Regression test for the notification-center crash (E2E 006-02): Button
// `asChild` must slot exactly ONE element child into Radix Slot. Previously it
// injected the Loader2 sibling, making Slot receive an array — which fails
// `React.isValidElement` and throws "Slot failed to slot onto its children"
// (RouteErrorBoundary on /notifications → zero rendered notification items).
// The center page's `<Button asChild><Link …/></Button>` crashed this way.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@plexica/ui';

describe('Button asChild (design system)', () => {
  it('slots a single link child without throwing', () => {
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        createElement(
          Button,
          { asChild: true, variant: 'ghost', size: 'sm' },
          createElement('a', { href: '/notifications/preferences' }, 'Preferences')
        )
      );
    }).not.toThrow();

    expect(html).toContain('href="/notifications/preferences"');
    expect(html).toContain('Preferences');
    // Button's variant/size classes merge onto the child.
    expect(html).toMatch(/<a[^>]*class="/);
  });

  it('renders a native button when asChild is not set', () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: 'primary' }, 'Save'));
    expect(html.startsWith('<button')).toBe(true);
    expect(html).toContain('Save');
  });
});

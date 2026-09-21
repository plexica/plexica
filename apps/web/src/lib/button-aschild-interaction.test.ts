// @vitest-environment jsdom
// button-aschild-interaction.test.ts
// Interaction tests for the disabled asChild activation guard (review finding):
// a native <button disabled> cannot be activated, but a Slot child (an anchor /
// router Link) has no native `disabled` — without a guard a "disabled" asChild
// anchor still navigates and its onClick still fires. The guard (capture-phase
// onClickCapture on the Slot) must suppress BOTH the navigation AND the child's
// onClick, while leaving the enabled path fully interactive.

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@plexica/ui';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

function dispatchClick(anchor: HTMLAnchorElement): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  anchor.dispatchEvent(event);
  return event;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('Button asChild disabled activation guard', () => {
  it('disabled asChild anchor does NOT navigate and suppresses its onClick', () => {
    const childClicked = vi.fn();
    const buttonClicked = vi.fn();
    render(
      createElement(
        Button,
        { asChild: true, disabled: true, onClick: buttonClicked },
        createElement('a', { href: '/nowhere', onClick: childClicked }, 'Go')
      )
    );

    const anchor = container?.querySelector('a');
    expect(anchor).not.toBeNull();
    // The guard is conveyed with aria-disabled and the child is removed from
    // the tab order (its native focusability cannot be switched off).
    expect(anchor?.getAttribute('aria-disabled')).toBe('true');
    expect(anchor?.getAttribute('tabindex')).toBe('-1');

    const event = dispatchClick(anchor as HTMLAnchorElement);

    // preventDefault blocks the native navigation; the capture-phase
    // stopPropagation suppresses the child's bubble-phase onClick.
    expect(event.defaultPrevented).toBe(true);
    expect(childClicked).not.toHaveBeenCalled();
    expect(buttonClicked).not.toHaveBeenCalled();
  });

  it('disabled + loading asChild keeps the guard active (aria-busy)', () => {
    const childClicked = vi.fn();
    render(
      createElement(
        Button,
        { asChild: true, loading: true },
        createElement('a', { href: '/busy', onClick: childClicked }, 'Busy')
      )
    );

    const anchor = container?.querySelector('a');
    expect(anchor?.getAttribute('aria-disabled')).toBe('true');
    expect(anchor?.getAttribute('aria-busy')).toBe('true');

    const event = dispatchClick(anchor as HTMLAnchorElement);
    expect(event.defaultPrevented).toBe(true);
    expect(childClicked).not.toHaveBeenCalled();
  });

  it('enabled asChild anchor still activates — child onClick fires, navigation not blocked', () => {
    const childClicked = vi.fn();
    render(
      createElement(
        Button,
        { asChild: true },
        createElement('a', { href: '/go', onClick: childClicked }, 'Go')
      )
    );

    const anchor = container?.querySelector('a');
    // Explicit `aria-disabled="false"` (not absence) — and no tabindex= -1.
    expect(anchor?.getAttribute('aria-disabled')).toBe('false');
    expect(anchor?.getAttribute('tabindex')).toBeNull();

    const event = dispatchClick(anchor as HTMLAnchorElement);

    expect(event.defaultPrevented).toBe(false);
    expect(childClicked).toHaveBeenCalledTimes(1);
  });
});

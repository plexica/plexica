// use-focus-trap.ts
// Focus trap hook for modal dialogs. Manages focus trapping, Escape to close, and focus restoration.
// Uses ref for onClose to avoid effect re-triggering on every render (WCAG 2.4.3).

import { useEffect, useRef, type RefObject } from 'react';

export function useFocusTrap(
  isOpen: boolean,
  onClose: () => void,
  sheetRef: RefObject<HTMLDivElement | null>
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first === undefined || last === undefined) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    rafRef.current = requestAnimationFrame(() => {
      const first = sheetRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Restore focus only if the element is still in the DOM
      const prev = previousFocusRef.current;
      if (prev !== null && document.body.contains(prev)) {
        prev.focus();
      }
    };
  }, [isOpen, sheetRef]);
}

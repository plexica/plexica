// @vitest-environment jsdom
// profile-form.test.tsx
// Interaction tests for the round-2 save-semantics fixes: a deliberate clear
// of a stored value surfaces a validation error (never a false "Saved"), a
// stale save failure clears on edit, and the form locks while saving.
// Raw react-dom + act (no testing-library in this repo); profileApi mocked.

// React 19 requires IS_REACT_ACT_ENVIRONMENT for async act() to flush
// scheduled store notifications (e.g. TanStack Query's reset()); without it
// async updates silently never flush and the stale-error test false-fails.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT ??= true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { profileApi } from '../../services/profile-api.js';
import { messages } from '../../i18n/messages.en.js';

import { ProfileForm, type ProfileFormInitial } from './profile-form.js';

import type { UserProfileDto } from '../../types/profile.js';

vi.mock('../../services/profile-api.js', () => ({
  profileApi: { get: vi.fn(), update: vi.fn(), uploadAvatar: vi.fn() },
}));

const updateMock = vi.mocked(profileApi.update);

const INITIAL: ProfileFormInitial = {
  displayName: 'Ada Lovelace',
  email: 'ada@test.io',
  timezone: 'UTC',
  language: 'en',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderForm(initial: ProfileFormInitial = INITIAL): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={messages}>
          <ProfileForm initial={initial} />
        </IntlProvider>
      </QueryClientProvider>
    );
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function input(name: string): HTMLInputElement {
  const el = container!.querySelector(`input[name="${name}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`missing input ${name}`);
  return el;
}

function setInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitForm(): void {
  container!
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('ProfileForm save semantics', () => {
  it('a deliberate display-name clear shows a validation error, never success', async () => {
    renderForm();
    act(() => {
      setInputValue(input('displayName'), '');
    });
    await act(async () => {
      submitForm();
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('Enter a display name');
    expect(container!.textContent).not.toContain('Saved');
  });

  it('a deliberate email clear shows a validation error, never success', async () => {
    renderForm();
    act(() => {
      setInputValue(input('email'), '');
    });
    await act(async () => {
      submitForm();
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('Enter a valid email address');
  });

  it('an untouched auto-provisioned profile still saves cleanly', async () => {
    renderForm({ displayName: '', email: '', timezone: 'UTC', language: 'en' });
    await act(async () => {
      submitForm();
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('Saved');
  });

  it('editing after a failed save clears the stale error', async () => {
    updateMock.mockRejectedValueOnce(new Error('db down'));
    renderForm();
    act(() => {
      setInputValue(input('displayName'), 'Ada Updated');
    });
    await act(async () => {
      submitForm();
    });
    await act(async () => {});
    expect(container!.textContent).toContain('Failed to save');

    act(() => {
      setInputValue(input('displayName'), 'Ada Corrected');
    });
    // The mutation reset notifies React on a setTimeout(0) tick (TanStack
    // default scheduler), which act() does not flush — poll instead.
    await vi.waitFor(() => {
      expect(container!.textContent).not.toContain('Failed to save');
    });
  });

  it('locks the form while a save is pending', async () => {
    updateMock.mockImplementationOnce(() => new Promise<UserProfileDto>(() => {}));
    renderForm();
    act(() => {
      setInputValue(input('displayName'), 'Ada Updated');
    });
    await act(async () => {
      submitForm();
    });

    expect(container!.querySelector('fieldset')?.hasAttribute('disabled')).toBe(true);
    expect(input('displayName').matches(':disabled')).toBe(true);
  });
});

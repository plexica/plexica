// login-page.tsx — Login page placeholder (Phase 0).
// Renders email input, password input, and submit button.
// These elements are asserted by the Playwright E2E smoke test (001-T37).

import { useState } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Button, Input } from '@plexica/ui';

export function LoginPage(): JSX.Element {
  const intl = useIntl();
  const [isLoading, setIsLoading] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // Phase 0 placeholder — real Keycloak auth implemented in Sprint 2
    setIsLoading(true);
    setTimeout(() => { setIsLoading(false); }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-900">
            <FormattedMessage id="login.title" />
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            <FormattedMessage id="login.subtitle" />
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            label={intl.formatMessage({ id: 'login.email.label' })}
            placeholder={intl.formatMessage({ id: 'login.email.placeholder' })}
          />

          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            label={intl.formatMessage({ id: 'login.password.label' })}
            placeholder={intl.formatMessage({ id: 'login.password.placeholder' })}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={isLoading}
          >
            {isLoading
              ? <FormattedMessage id="login.loading" />
              : <FormattedMessage id="login.submit" />
            }
          </Button>
        </form>
      </div>
    </div>
  );
}

// app.tsx — Root App component.
// At Phase 0, renders a login page placeholder.
// Real auth routing will be implemented in Phase 1 (Sprint 2).

import { useEffect } from 'react';
import { useIntl } from 'react-intl';

import { LoginPage } from './pages/login-page.js';

export function App(): JSX.Element {
  const intl = useIntl();

  useEffect(() => {
    document.title = intl.formatMessage({ id: 'app.name' });
  }, [intl]);

  return (
    <main>
      <LoginPage />
    </main>
  );
}

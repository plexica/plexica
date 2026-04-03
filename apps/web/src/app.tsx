// app.tsx — Root App component.
// Routing is handled entirely by TanStack Router (see router.tsx).
// Title effect is managed per-route via router meta.

import { useEffect } from 'react';
import { useIntl } from 'react-intl';

export function App(): JSX.Element {
  const intl = useIntl();

  useEffect(() => {
    document.title = intl.formatMessage({ id: 'app.name' });
  }, [intl]);

  return <></>;
}

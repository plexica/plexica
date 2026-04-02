import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { KcPage } from './login/KcPage';

// Self-hosted Inter font — avoids GDPR external request to Google Fonts
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

// Import design system CSS tokens
import '@plexica/ui/tokens';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root not found in document');
}

createRoot(container).render(
  <StrictMode>
    <KcPage kcContext={window.kcContext} />
  </StrictMode>
);

declare global {
  interface Window {
    kcContext?: Parameters<typeof KcPage>[0]['kcContext'];
  }
}

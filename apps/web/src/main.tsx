// main.tsx — React application entry point.
// Wraps the app in IntlProvider (i18n) and renders to the DOM.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { IntlProvider } from 'react-intl';

import { messages } from './i18n/messages.en.js';
import { App } from './app.js';

import '@plexica/ui/tokens';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root not found in DOM');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <IntlProvider locale="en" messages={messages}>
      <App />
    </IntlProvider>
  </React.StrictMode>
);

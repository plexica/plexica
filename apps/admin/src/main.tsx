// main.tsx — Entry point for the Plexica Admin app.
// Full router, auth store, and providers will be added in S5-C01.

import { createRoot } from 'react-dom/client';

function AdminApp() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Plexica Admin</h1>
        <p className="mt-2 text-sm text-gray-500">Platform control plane — scaffold ready</p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(<AdminApp />);

// apps/super-admin/src/App.tsx

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthWrapper } from './components/AuthWrapper';
import { ThemeProvider } from './contexts/ThemeContext';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthWrapper />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

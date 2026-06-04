import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './index.css';
import { App } from './App';
import { ThemeProvider } from './hooks/use-theme';
import { AuthProvider } from './hooks/use-auth';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/toaster';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <TooltipProvider delayDuration={200}>
              <App />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);

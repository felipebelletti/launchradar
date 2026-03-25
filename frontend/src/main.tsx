import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './app.css';
import { App } from './App';
import { AuthGuard } from './components/auth/AuthGuard';
import { MagicLinkCallback } from './components/auth/MagicLinkCallback';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/auth/magic" element={<MagicLinkCallback />} />
          <Route
            path="*"
            element={
              <AuthGuard>
                <App />
              </AuthGuard>
            }
          />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);

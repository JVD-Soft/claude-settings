import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '@/providers/ThemeProvider';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entries, as react-router's MemoryRouter takes them. */
  route?: string;
}

/**
 * Renders a component inside the same provider stack as the running app,
 * with two deliberate differences:
 *
 * - `MemoryRouter` instead of `BrowserRouter`, so a test can start at a route
 *   without touching jsdom's history.
 * - A **fresh** `QueryClient` per call. The app keeps one client for its whole
 *   lifetime, which is correct there and wrong here: a shared client would
 *   carry cached data and in-flight retries from one test into the next, and
 *   the failure shows up in whichever test happens to run second.
 *
 * `retry: false` matters as much — the app's policy retries transient errors,
 * so an error-path test would otherwise sit through the backoff before
 * settling, or time out.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', ...options }: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

  return {
    user: userEvent.setup(),
    queryClient,
    ...rtlRender(ui, { wrapper: Wrapper, ...options }),
  };
}

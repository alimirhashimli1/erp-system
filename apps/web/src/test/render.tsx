import type { Role } from '@procurestack/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';

/** Renders `ui` as a signed-in user with the given roles, with fresh React Query state. */
export function renderAs(roles: Role[], ui: ReactNode, path = '/'): RenderResult {
  const auth: AuthContextValue = {
    state: {
      status: 'authenticated',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'me@test.dev',
        fullName: 'Test User',
        roles,
      },
    },
    login: vi.fn(),
    logout: vi.fn(),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

type Handler = (body: unknown) => { status?: number; body?: unknown };

/**
 * Minimal fetch fake keyed by "METHOD /path" (query string ignored). Returns the spy so
 * tests can assert on what the UI actually sent to the API.
 */
export function mockApi(routes: Record<string, Handler | object>) {
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      'http://localhost',
    );
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const route = routes[key];
    if (!route) return Promise.resolve(new Response(`No mock for ${key}`, { status: 404 }));
    const sent: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const { status = 200, body } =
      typeof route === 'function' ? (route as Handler)(sent) : { body: route };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Parsed JSON body of the first request with this method sent through `mockApi`. */
export function sentBody(spy: ReturnType<typeof mockApi>, method: string): unknown {
  const body = spy.mock.calls.find(([, init]) => init?.method === method)?.[1]?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

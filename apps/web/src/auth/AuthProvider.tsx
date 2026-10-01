import { AccessTokenResponseSchema, type LoginCredentials } from '@procurestack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { apiFetch, refreshSession, tokenStore } from '../api/http';
import { AuthContext, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // On page load, try to resume the session from the httpOnly refresh cookie.
  useEffect(() => {
    void refreshSession().then((session) => {
      setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' });
    });
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const session = await apiFetch('/auth/login', {
      method: 'POST',
      body: credentials,
      schema: AccessTokenResponseSchema,
    });
    tokenStore.set(session.accessToken);
    setState({ status: 'authenticated', user: session.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', schema: z.undefined() });
    } finally {
      tokenStore.set(null);
      queryClient.clear(); // never show the next user cached data from the previous one
      setState({ status: 'anonymous' });
    }
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

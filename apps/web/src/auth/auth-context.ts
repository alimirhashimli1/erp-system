import type { AuthUser, LoginCredentials } from '@procurestack/shared';
import { createContext, useContext } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: AuthUser };

export interface AuthContextValue {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginCredentials, type LoginInput } from '@procurestack/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/auth-context';

const DEMO_ACCOUNTS = ['requester', 'approver', 'buyer', 'warehouse', 'finance', 'admin'];

export function LoginPage() {
  const { state, login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  // Same Zod schema the API validates with — client and server can't disagree on rules.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginCredentials>({ resolver: zodResolver(LoginSchema) });

  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = async (credentials: LoginCredentials) => {
    setServerError(null);
    try {
      await login(credentials);
    } catch (e) {
      setServerError(
        e instanceof ApiError && e.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : 'Invalid email or password.',
      );
    }
  };

  return (
    <main className="auth-page">
      <form className="card" onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
        <h1>ProcureStack</h1>
        <p className="muted">Sign in to the procurement workspace</p>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" {...register('email')} />
        {errors.email && <p className="field-error">{errors.email.message}</p>}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="field-error">{errors.password.message}</p>}

        {serverError && (
          <p className="form-error" role="alert">
            {serverError}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>

        {import.meta.env.DEV && (
          <p className="muted small">
            Demo accounts: {DEMO_ACCOUNTS.map((a) => `${a}@procurestack.dev`).join(', ')} — password
            is <code>SEED_DEFAULT_PASSWORD</code> from your .env
          </p>
        )}
      </form>
    </main>
  );
}

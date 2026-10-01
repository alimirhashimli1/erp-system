import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { LoginPage } from './LoginPage';

function renderLogin(login: AuthContextValue['login']) {
  const value: AuthContextValue = { state: { status: 'anonymous' }, login, logout: vi.fn() };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('shows shared-schema validation errors and does not call the API', async () => {
    const login = vi.fn();
    renderLogin(login);

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('submits the parsed (lower-cased) credentials', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin(login);

    await userEvent.type(screen.getByLabelText('Email'), 'Buyer@ProcureStack.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).toHaveBeenCalledWith({ email: 'buyer@procurestack.dev', password: 'secret' });
  });

  it('shows a rate-limit message on 429', async () => {
    renderLogin(vi.fn().mockRejectedValue(new ApiError(429, 'Too Many Requests')));

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });
});

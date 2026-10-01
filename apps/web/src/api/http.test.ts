import { AuthUserSchema } from '@procurestack/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, refreshSession, tokenStore } from './http';

const user = {
  id: '6f1c3c2e-8a8b-4d1e-9a51-0e7b0f4f2a10',
  email: 'buyer@procurestack.dev',
  fullName: 'Bea Buyer',
  roles: ['BUYER'],
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('http client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.set('expired-token');
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('refreshes once on 401 and replays the request with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh', expiresIn: 900, user }))
      .mockResolvedValueOnce(json(200, user));

    await expect(apiFetch('/auth/me', { schema: AuthUserSchema })).resolves.toEqual(user);

    const replay = fetchMock.mock.calls[2]?.[1];
    expect(replay?.headers).toMatchObject({ Authorization: 'Bearer fresh' });
  });

  it('never retries the session endpoints themselves', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Invalid credentials' }));
    await expect(
      apiFetch('/auth/login', { method: 'POST', body: {}, schema: AuthUserSchema }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh request between concurrent callers (rotation-safe)', async () => {
    fetchMock.mockResolvedValue(json(200, { accessToken: 'fresh', expiresIn: 900, user }));
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects responses that break the shared contract', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...user, roles: ['SUPERUSER'] }));
    await expect(apiFetch('/x', { schema: AuthUserSchema })).rejects.toThrow();
  });
});

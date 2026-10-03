import { AccessTokenResponseSchema, type AccessTokenResponse } from '@procurestack/shared';
import type { z } from 'zod';

/*
 * The access token lives only in memory (not localStorage), so an XSS payload can't simply
 * read it from storage. A page reload loses it; the httpOnly refresh cookie restores it.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stable business error code from the API (e.g. `SUPPLIER_EXISTS`), when present. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Human-readable text for any thrown value, for inline error messages. */
export const errorText = (e: unknown): string =>
  e instanceof ApiError && e.status === 403
    ? 'You do not have permission to do this.'
    : e instanceof Error
      ? e.message
      : 'Something went wrong.';

/** Session endpoints themselves must never trigger a refresh-and-retry loop. */
const NO_RETRY_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

let refreshInFlight: Promise<AccessTokenResponse | null> | null = null;

/**
 * Single-flight: concurrent callers share one refresh request. Refresh tokens are
 * single-use (rotation), so two parallel refreshes would look like token theft to the
 * server and revoke the session. React StrictMode's double effects would trigger this.
 */
export function refreshSession(): Promise<AccessTokenResponse | null> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) {
        tokenStore.set(null);
        return null;
      }
      const session = AccessTokenResponseSchema.parse(await res.json());
      tokenStore.set(session.accessToken);
      return session;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Response is parsed with this schema — a runtime check that the API kept its contract. */
  schema: S;
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  options: RequestOptions<S>,
  retryOnUnauthorized = true,
): Promise<z.output<S>> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  // Access token expired mid-session: refresh once, then replay the original request.
  if (res.status === 401 && retryOnUnauthorized && !NO_RETRY_PATHS.has(path)) {
    if (await refreshSession()) return apiFetch(path, options, false);
  }

  if (!res.ok) {
    const { message, code } = await errorBody(res);
    throw new ApiError(res.status, message, code);
  }
  return options.schema.parse(res.status === 204 ? undefined : await res.json());
}

async function errorBody(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { message?: unknown; code?: unknown };
    return {
      message: typeof body.message === 'string' ? body.message : res.statusText,
      ...(typeof body.code === 'string' ? { code: body.code } : {}),
    };
  } catch {
    return { message: res.statusText };
  }
}

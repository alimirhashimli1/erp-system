# @procurestack/web

React 19 + Vite SPA. Server state with React Query, forms with React Hook Form + the
shared Zod schemas.

## Run & test

```bash
pnpm dev        # http://localhost:5173, proxies /api → http://localhost:3000
pnpm test       # Vitest + React Testing Library
pnpm build      # typecheck + production bundle in dist/
```

## Layout

```
src/
  api/http.ts      fetch wrapper: in-memory access token, single-flight refresh, Zod-parsed responses
  auth/            AuthProvider (session restore/login/logout), RequireAuth route gate
  pages/           LoginPage, DashboardPage
nginx/             production config: static files + /api reverse proxy + security headers
```

Route gating here is UX only; the API enforces every permission.

# @procurestack/shared

The contract between API and web: Zod schemas, inferred types, domain constants.
Change a schema here and both apps' validation and types follow.

```bash
pnpm build   # tsup → dist/ (ESM for Vite, CJS for Nest, .d.ts)
pnpm test    # Vitest
```

## Layout

```
src/
  auth/roles.ts          ROLES tuple, RoleSchema, labels
  auth/auth.schemas.ts   LoginSchema, AuthUserSchema, AccessTokenResponseSchema
  index.ts               public exports (only import from the package root)
```

Rule: no runtime dependencies besides `zod`; no Node- or browser-only APIs.

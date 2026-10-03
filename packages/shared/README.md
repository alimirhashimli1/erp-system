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
  common/money.ts        integer-cent helpers: lineTotalCents, applyBps, formatCents (ADR 0005)
  master-data/           supplier/item/cost-center schemas, UoMs
  requisitions/          PR schemas + approvalLevelsFor (DoA lookup)
  logistics/             Incoterms 2020 table, landedCost(), freight-mode estimates
  index.ts               public exports (only import from the package root)
```

Rule: no runtime dependencies besides `zod`; no Node- or browser-only APIs. Pure business
functions live here only when both API and UI must compute the same result.

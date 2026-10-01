# ADR 0002 — Toolchain version pins

**Status:** Accepted · 2026-10-01

## Context

At project start the newest releases were NestJS 12, TypeScript 7 (native Go compiler)
and Prisma 8 RC. Several ecosystem packages had not caught up, and the dev machine runs
Node 24.11.

## Decision

| Tool       | Pinned                   | Why not newer                                                                      |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Node       | 24 LTS (images: 24.11.1) | —                                                                                  |
| pnpm       | 12.4.2                   | —                                                                                  |
| TypeScript | 6.0.3                    | `typescript-eslint` supports `<6.1`; TS 7 has no compatible type-aware linting yet |
| NestJS     | 11.x                     | `nestjs-zod` supports Nest ≤11; Nest 12 CLI needs Node ≥24.15                      |
| Prisma     | 7.10                     | 8.x is still a release candidate                                                   |
| jsdom      | 29                       | 30 needs Node ≥24.15                                                               |

All versions are exact (`saveExact: true`); Dependabot proposes upgrades weekly.
pnpm's `allowBuilds` allow-list controls which packages may run install scripts, and
`minimumReleaseAge` delays brand-new releases (exclusions are listed explicitly).

## Consequences

Revisit when `nestjs-zod` supports Nest 12 and `typescript-eslint` supports TS 7;
upgrading is then a single dependency PR plus fixes.

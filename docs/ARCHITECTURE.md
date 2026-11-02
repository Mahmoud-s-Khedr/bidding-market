# Architecture

pnpm + Turborepo monorepo. Node 22, TypeScript 5.9 (strict).

```
apps/
  api/        NestJS 12 REST API + Socket.IO gateway (package name: "api")
  web/        Next.js 16 App Router frontend (package name: "web")
packages/
  shared/     "@market/shared": zod schemas, enums, DTO types, WS event contracts
```

## Backend (apps/api)

- NestJS 12, `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/throttler`, helmet.
- Prisma **7.10.1** (pin exact; do not use 8.x rc) with PostgreSQL 17. Schema in `apps/api/prisma/schema.prisma`,
  migrations committed in `apps/api/prisma/migrations`.
- Redis: Socket.IO redis adapter + presence.
- S3-compatible storage (SeaweedFS S3 locally, port 8333) via `@aws-sdk/client-s3` + presigned URLs.
- Auth: JWT access token (Bearer, 15m) + rotating refresh token (httpOnly, Secure in prod,
  SameSite=Lax cookie `refresh_token`, HMAC-SHA-256 indexed in DB using `JWT_REFRESH_SECRET`). argon2 password hashing.
- Validation: zod schemas from `@market/shared` via a `ZodValidationPipe`.
- `JwtAuthGuard` is global and endpoints explicitly opt out with `@Public()`. The one-active-bid-per-user/listing rule and conversation participant/listing dedup are enforced transactionally in their services because they cannot be represented as portable plain unique constraints. Agreements retain historical rows, so a listing may be re-listed after cancellation rather than being permanently limited to one agreement.
- Refresh tokens are opaque high-entropy values stored as HMAC-SHA256 lookups, allowing constant-time database lookup and family reuse detection.
- Config: env validated by zod at boot.
- Module layout: `src/modules/<feature>/{<feature>.module.ts, .controller.ts, .service.ts, *.spec.ts}`.
- Tests: **Vitest** (with `unplugin-swc` for decorators). Unit: `*.spec.ts` next to code.
  Integration: `test/**/*.int-spec.ts` booting the Nest app against real Postgres via supertest,
  truncating tables between tests.

## Frontend (apps/web)

- Next.js 16 App Router, React 19, Tailwind CSS 4, accessible primitives (Radix UI), lucide icons.
- Data: TanStack Query + typed fetch client in `src/lib/api`. Socket.IO client for realtime.
- Auth: access token kept in memory; silent refresh via `/auth/refresh` cookie; protected routes.
- Forms: react-hook-form + zod schemas from `@market/shared`.
- Tests: Vitest + Testing Library (jsdom) for components; Playwright for e2e in `apps/web/e2e`.

## Quality gates (CI — `.github/workflows/ci.yml`)

Every PR to `main` must pass the single required check **CI OK**, which aggregates:
format check, ESLint (type-aware), typecheck, unit tests with coverage thresholds, integration tests
against real Postgres/Redis/S3, Prisma schema↔migration drift check, production build,
Playwright e2e, `pnpm audit` (high+), gitleaks secret scan, dependency review (license + vuln),
conventional PR title. CodeQL runs separately. Branch protection forbids direct pushes and
force-pushes to `main`. Each PR is additionally reviewed by a Claude Sonnet 5.5 reviewer before merge.

### S3 client note

SeaweedFS (and other non-AWS S3 servers) reject the AWS SDK v3 default flexible checksums on
presigned PUTs. Always construct the client with
`requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', forcePathStyle: true`.
The API must create the bucket on boot if it does not exist.

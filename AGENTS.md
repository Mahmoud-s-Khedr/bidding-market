# Agent Rules (read fully before writing code)

You are a worker on this repo. A manager assigns you one task from `docs/TASKS.md`; a reviewer
will review your PR line by line and CI must be green. Read `docs/SPEC.md`, `docs/ARCHITECTURE.md`
and `docs/API.md` first — **the API contract is binding**; if you must deviate, update `docs/API.md`
in the same PR and say why in the PR body.

## Hard rules

1. Work only in your assigned git worktree/branch. Never push to or commit on `main`. Never force-push
   someone else's branch. Never edit `.github/` or root tooling config unless the task says so.
2. Strict TypeScript. No `any`, no `@ts-ignore`/`@ts-expect-error`, no `eslint-disable` without a
   one-line justification comment. No `console.log` (use Nest `Logger` on the API).
3. Every API endpoint: zod-validated input (schemas live in `packages/shared`), explicit
   authorization (owner/participant/admin), and integration tests covering happy path, validation
   error, unauthenticated, and forbidden/not-found cases.
4. Business logic lives in services with unit tests. Multi-row state changes use Prisma
   transactions (`$transaction`). Watch for races (e.g. accepting two bids at once — use a
   conditional update on status).
5. Frontend: accessible (labels, roles, keyboard, focus states), responsive, loading/empty/error
   states for every data view. Component tests with Testing Library for non-trivial components.
6. Schema changes: edit `apps/api/prisma/schema.prisma` **and** create a migration with
   `pnpm --filter api exec prisma migrate dev --name <name>` (needs `docker compose up -d`).
   `pnpm --filter api db:check` must report no drift.
7. Don't add heavy dependencies without need; prefer what is already in the stack. Pin Prisma to 7.10.1.
8. Conventional commits: `feat(api): ...`, `fix(web): ...`, `test(api): ...`, `chore(repo): ...`.
   Allowed scopes: api, web, shared, ci, deps, repo, docs, db, e2e. The pre-commit hook runs lint-staged;
   don't bypass it with `--no-verify`.

## Package script contract (CI depends on these names)

Every package: `build`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run --coverage`, thresholds ≥ 80% lines/functions/statements, ≥ 70% branches on business logic; exclude generated code, `main.ts`, module files, and config).
`apps/api` additionally: `test:integration`, `db:check` (exit≠0 on schema↔migrations drift, uses `SHADOW_DATABASE_URL`), `db:migrate:deploy`, `db:seed` (idempotent: admin `admin@market.test` / `Admin12345!`, demo users `alice@market.test` / `bob@market.test` password `Password123!`, categories, a few listings), `dev`, `start`.
`apps/web` additionally: `test:e2e` (Playwright; its `webServer` config starts both API (`pnpm --filter api start`) and web (`pnpm --filter web start`) from built output).

## Definition of done for a task

- [ ] `scripts/ci-local.sh --with-db` passes (runs the CI pipeline on a clean checkout of HEAD — commit first). It catches missing generated files, env assumptions and lockfile drift that your dirty worktree hides.
- [ ] `pnpm install && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass locally from the repo root.
- [ ] API: `pnpm --filter api test:integration` passes against local docker Postgres/Redis/S3.
- [ ] `pnpm audit --audit-level high` and `pnpm audit --prod --audit-level moderate` exit 0.
- [ ] Docs updated if behaviour/contract changed.
- [ ] Committed on your branch with conventional commit messages. Then **stop** — the manager pushes and opens the PR.

When you finish, print a short report: what you built, files touched, test results (paste the
summary lines), known gaps/TODOs, and any contract deviations.

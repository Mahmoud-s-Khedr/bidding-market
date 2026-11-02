# Bidding Market

Online marketplace where people and businesses publish service requests or offers, receive
competitive bids, negotiate, and complete transactions — with integrated real-time messaging
(text, images, documents, voice notes), dashboards, and an admin panel.

See [docs/SPEC.md](docs/SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md).

## Quick start

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter api db:migrate:deploy && pnpm --filter api db:seed
pnpm dev   # web on :3000, api on :4000
```

## Quality gates

All changes land through pull requests. `main` is protected: the **CI OK** check (lint, typecheck,
unit + integration + e2e tests, build, migration drift, audit, secret scan, dependency review) and
CodeQL must pass. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

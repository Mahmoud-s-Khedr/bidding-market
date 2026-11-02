## Summary

<!-- What does this PR change and why? Link the task ID from docs/TASKS.md. -->

## Checklist

- [ ] Task ID: <!-- e.g. API-03 -->
- [ ] Tests added/updated (unit + integration where applicable)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] Prisma migration included if schema changed (`pnpm --filter api db:check` clean)
- [ ] No secrets, no `any`, no disabled lint rules without justification
- [ ] Authorization checked for every new endpoint (owner/participant/admin)

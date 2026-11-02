# Task Board

Owner legend: **codex** = GPT-5.6 Terra (medium) via codex-personal, **gemini** = Gemini 3.8 Flash (medium) via antigravity.
Every task = one branch `task/<id>-<slug>` → PR → CI OK + Sonnet 5.5 review → merge.

## Phase 1 — foundations (parallel)

| ID     | Owner  | Task                                                                                                                                                                                                                                                                                                                                                         | Depends | Status |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ |
| API-01 | codex  | API scaffold: NestJS app, env config, Prisma schema for the **entire** domain + initial migration, `packages/shared` (zod schemas/enums for whole API), error filter, zod pipe, helmet/CORS/throttler, health, auth (register/login/refresh rotation/logout/me), users/profile, seed, Vitest unit + integration harness                                      | –       | todo   |
| WEB-01 | gemini | Web scaffold: Next.js 16 + Tailwind 4 + design system (Button, Input, Textarea, Select, Card, Badge, Dialog, Toast, Avatar, Tabs, Skeleton, EmptyState), app shell (header w/ search, nav, user menu, footer), auth pages (login/register) + auth provider w/ silent refresh, typed API client, TanStack Query, Vitest + RTL, Playwright config + smoke test | –       | todo   |

## Phase 2 — core marketplace

| API-02 | codex  | Categories (public tree + admin CRUD), uploads (presign/complete/url, S3/SeaweedFS), listings CRUD + search/filter/sort/cursor pagination (Postgres full-text)             | API-01         | todo |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- |
| API-03 | codex  | Bids + negotiation (revisions, counter, accept-counter, accept w/ race-safe transaction creating Agreement + Conversation), `/bids/mine`                                   | API-02         | todo |
| WEB-02 | gemini | Home, browse/search page with filters & sort & infinite scroll, category pages, listing detail, create/edit listing form with image/attachment upload, public profile page | API-02, WEB-01 | todo |

## Phase 3 — communication & transactions

| API-04 | codex | Conversations/messages REST + Socket.IO `/rt` gateway (JWT auth, redis adapter, rooms, typing, read receipts, presence), notifications module (persist + push) wired to bid/message events | API-03 | todo |
| API-05 | codex | Agreements: milestones, deliverables, accept/revision, dual-confirm complete, cancel, dispute, reviews + rating aggregates, dashboard summary | API-04 | todo |
| WEB-03 | gemini | Bidding UI: bid form, bid list/compare table for owner (sort, shortlist, reject, counter, accept), bidder negotiation view, my bids page | API-03, WEB-02 | todo |
| WEB-04 | gemini | Messaging UI: conversation list, chat view w/ realtime, typing, read receipts, image/file attachments, **voice note recording** (MediaRecorder) + playback, unread badges | API-04, WEB-03 | todo |

## Phase 4 — dashboards, admin, hardening

| API-06 | codex | Reports + admin module (stats, users, listings moderation, reports resolve, audit log) | API-05 | todo |
| WEB-05 | gemini | Dashboard (overview, my listings, my bids, conversations, agreements) + agreement page (timeline, milestones, deliverables, complete/cancel/dispute, review) + notifications dropdown/page | API-05, WEB-04 | todo |
| WEB-06 | gemini | Admin panel (stats charts, users, categories, listings, reports queue, audit log), report-content dialogs across app | API-06, WEB-05 | todo |
| E2E-01 | codex | Playwright e2e of critical journeys: register → create listing → other user bids → negotiate → accept → chat → deliver → complete → review; admin moderation | all | todo |
| DOC-01 | manager | README, final verification | all | todo |

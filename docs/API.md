# API Contract (v1)

Base URL: `${NEXT_PUBLIC_API_URL}/api/v1`. JSON everywhere. Auth: `Authorization: Bearer <access>`.
Refresh token travels only in the httpOnly cookie `refresh_token` (path `/api/v1/auth`).
Requests from the web app use `credentials: 'include'`.

## Conventions

- IDs: cuid2 strings. Timestamps: ISO 8601 strings. Money: integer **minor units** (`amountCents`) + `currency` (ISO 4217, default `USD`).
- Errors: `{ "error": { "code": "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL", "message": string, "details"?: unknown } }` with matching HTTP status.
- Lists: `?cursor=<id>&limit=<1..50, default 20>` → `{ "items": T[], "nextCursor": string | null }`.
- 🔒 = requires auth, 👑 = admin only. Authorization failures on someone else's resource return 404 when existence should not leak, else 403.

## Auth

| Method | Path           | Body / Notes                                                       | Response                                                                          |
| ------ | -------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| POST   | /auth/register | `{email, password(min 8), displayName, isBusiness?, companyName?}` | `{accessToken, user}` + sets cookie                                               |
| POST   | /auth/login    | `{email, password}`                                                | `{accessToken, user}` + sets cookie                                               |
| POST   | /auth/refresh  | cookie                                                             | `{accessToken, user}` rotates cookie; reuse of a revoked token revokes the family |
| POST   | /auth/logout   | cookie                                                             | 204, clears cookie                                                                |
| GET    | /auth/me 🔒    |                                                                    | `User` (private shape, includes email, role)                                      |

## Users

| GET   | /users/:id         | public profile `{id, displayName, avatarUrl, bio, location, isBusiness, companyName, ratingAvg, ratingCount, completedCount, createdAt}` |
| ----- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PATCH | /users/me 🔒       | `{displayName?, bio?, location?, avatarKey?, isBusiness?, companyName?}`                                                                 |
| GET   | /users/:id/reviews | paginated reviews received                                                                                                               |

## Uploads

| POST | /uploads/presign 🔒 | `{purpose: 'LISTING_IMAGE'|'LISTING_ATTACHMENT'|'BID_ATTACHMENT'|'MESSAGE_ATTACHMENT'|'DELIVERABLE'|'AVATAR', fileName, mimeType, sizeBytes}` → `{uploadId, url, fields?|headers, key, expiresAt}` (validates MIME allowlist + size per purpose) |
|---|---|---|
| POST | /uploads/:uploadId/complete 🔒 | marks upload ready, returns `Attachment {id, key, url, fileName, mimeType, sizeBytes}` |
| GET | /uploads/:id/url 🔒 | short-lived signed GET URL (authorization: uploader, or participant of the owning conversation/agreement/listing is public) |

Limits: images (jpeg/png/webp/gif) ≤ 10 MB; documents (pdf, docx, xlsx, txt, zip) ≤ 25 MB; voice (webm/ogg/mp4/mpeg audio) ≤ 10 MB.

## Categories

| GET               | /categories                | tree `[{id, name, slug, parentId, children: [...] , listingCount}]`         |
| ----------------- | -------------------------- | --------------------------------------------------------------------------- |
| POST/PATCH/DELETE | /admin/categories[/:id] 👑 | `{name, slug, parentId?, description?}`; delete fails 409 if listings exist |

## Listings

| GET | /listings | filters: `q, kind, categoryId|categorySlug (includes descendants), minPrice, maxPrice, currency, location, status (default OPEN), ownerId, sort=newest|price_asc|price_desc|ending_soon|most_bids, cursor, limit` → paginated `ListingSummary` |
|---|---|---|
| GET | /listings/:id | `ListingDetail` (owner, category, images, attachments, bidCount, myBid if authed) — DRAFT/REMOVED only visible to owner/admin |
| POST | /listings 🔒 | `{kind, title(5..120), description(20..10000), categoryId, priceType: 'FIXED'|'RANGE'|'NEGOTIABLE', priceMinCents?, priceMaxCents?, currency, deliveryDays?, location?, tags?: string[≤10], imageIds?, attachmentIds?, expiresAt?, status?: 'DRAFT'|'OPEN'}` |
| PATCH | /listings/:id 🔒 owner | same fields (not when IN_PROGRESS/COMPLETED) |
| POST | /listings/:id/close 🔒 owner | OPEN → CLOSED; pending bids declined |
| DELETE | /listings/:id 🔒 owner | only DRAFT or no bids, else 409 |

## Bids

| GET | /listings/:id/bids 🔒 | owner sees all (sort: `amount_asc|amount_desc|delivery|rating|newest`); bidder sees only own |
|---|---|---|
| POST | /listings/:id/bids 🔒 | `{amountCents, currency, deliveryDays, message(≤5000), attachmentIds?}`; 409 if own listing / not OPEN / already has active bid |
| GET | /bids/mine 🔒 | my bids with listing summary, filter `status` |
| GET | /bids/:id 🔒 | bid + revision history (owner or bidder) |
| PATCH | /bids/:id 🔒 bidder | edit while PENDING/SHORTLISTED/COUNTERED → creates BidRevision |
| POST | /bids/:id/withdraw 🔒 bidder | → WITHDRAWN |
| POST | /bids/:id/shortlist 🔒 owner | → SHORTLISTED |
| POST | /bids/:id/reject 🔒 owner | `{reason?}` → REJECTED |
| POST | /bids/:id/counter 🔒 owner | `{amountCents, deliveryDays, message}` → COUNTERED (revision by owner) |
| POST | /bids/:id/accept-counter 🔒 bidder | accepts owner's counter → bid amount updated, status ACCEPTED, agreement created |
| POST | /bids/:id/accept 🔒 owner | → ACCEPTED; listing IN_PROGRESS; other active bids DECLINED; Agreement + Conversation created. Returns `{bid, agreement}` |

Bid statuses: `PENDING, SHORTLISTED, COUNTERED, ACCEPTED, REJECTED, WITHDRAWN, DECLINED`.

## Conversations & messages

| GET  | /conversations 🔒                 | my conversations with `otherParticipant, lastMessage, unreadCount, listing?, agreementId?` |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| POST | /conversations 🔒                 | `{recipientId, listingId?, bidId?}` → existing or new (dedup on participants+listing)      |
| GET  | /conversations/:id 🔒 participant |                                                                                            |
| GET  | /conversations/:id/messages 🔒    | cursor paginated, newest first                                                             |
| POST | /conversations/:id/messages 🔒    | `{type: 'TEXT'                                                                             | 'IMAGE' | 'FILE' | 'VOICE', body?, attachmentIds?, voiceDurationSec?}` |
| POST | /conversations/:id/read 🔒        | `{lastMessageId}` marks read                                                               |

## Agreements (transactions)

| GET | /agreements 🔒 | mine, filter `status`, `role=buyer|provider` |
|---|---|---|
| GET | /agreements/:id 🔒 participant | detail: parties, listing, bid, milestones, deliverables, timeline, conversationId, myConfirmation |
| POST | /agreements/:id/milestones 🔒 participant | `{title, amountCents?, dueDate?}` |
| PATCH | /agreements/:id/milestones/:mid 🔒 participant | `{title?, status?: 'PENDING'|'IN_PROGRESS'|'DONE'}` |
| POST | /agreements/:id/deliverables 🔒 provider | `{note, attachmentIds}` → status DELIVERED |
| POST | /agreements/:id/deliverables/:did/accept 🔒 buyer | |
| POST | /agreements/:id/deliverables/:did/request-revision 🔒 buyer | `{note}` → ACTIVE |
| POST | /agreements/:id/complete 🔒 participant | records confirmation; when both confirmed → COMPLETED, listing COMPLETED |
| POST | /agreements/:id/cancel 🔒 participant | `{reason}` → CANCELLED; listing → CLOSED |
| POST | /agreements/:id/dispute 🔒 participant | `{reason}` → DISPUTED (creates admin report) |
| POST | /agreements/:id/reviews 🔒 participant | `{rating 1..5, comment?}` only when COMPLETED, once per party |

Roles: in a `REQUEST` listing the owner is **buyer** and bidder is **provider**; in an `OFFER` listing the owner is **provider** and bidder is **buyer**.

## Notifications

| GET  | /notifications 🔒              | paginated, `?unread=true` |
| ---- | ------------------------------ | ------------------------- |
| GET  | /notifications/unread-count 🔒 | `{count}`                 |
| POST | /notifications/:id/read 🔒     |                           |
| POST | /notifications/read-all 🔒     |                           |

Types: `BID_RECEIVED, BID_UPDATED, BID_COUNTERED, BID_ACCEPTED, BID_REJECTED, MESSAGE_RECEIVED, DELIVERABLE_SUBMITTED, DELIVERABLE_ACCEPTED, REVISION_REQUESTED, AGREEMENT_COMPLETED, AGREEMENT_CANCELLED, REPORT_RESOLVED, REVIEW_RECEIVED`. Shape `{id, type, title, body, link, readAt, createdAt, data}`.

## Dashboard

| GET | /dashboard/summary 🔒 | `{listings: {open, inProgress, completed}, bids: {pending, accepted}, agreements: {active, completed}, unreadMessages, unreadNotifications}` |

## Reports

| POST | /reports 🔒 | `{targetType: 'LISTING'|'USER'|'MESSAGE'|'BID', targetId, reason: 'SPAM'|'FRAUD'|'INAPPROPRIATE'|'HARASSMENT'|'OTHER', details?}` |

## Admin 👑

| GET   | /admin/stats                         | totals + 30-day daily series of signups, listings, bids, agreements |
| ----- | ------------------------------------ | ------------------------------------------------------------------- |
| GET   | /admin/users                         | `q, role, status` paginated                                         |
| PATCH | /admin/users/:id                     | `{role?, status?: 'ACTIVE'                                          | 'SUSPENDED'      | 'BANNED', reason?}` (cannot modify self) |
| GET   | /admin/listings                      | all statuses, `q, status`                                           |
| POST  | /admin/listings/:id/remove, /restore | `{reason}`                                                          |
| GET   | /admin/reports                       | `status=OPEN                                                        | RESOLVED         | DISMISSED`                               |
| POST  | /admin/reports/:id/resolve           | `{action: 'DISMISS'                                                 | 'REMOVE_CONTENT' | 'SUSPEND_USER', note}`                   |
| GET   | /admin/audit-log                     | paginated admin actions                                             |

## Health

`GET /health` → `{status:'ok', db:'ok', redis:'ok'}` (not under /api/v1).

## WebSocket (Socket.IO, namespace `/rt`)

Connect with `auth: { token: <accessToken> }`; invalid token → `connect_error`. Each socket joins room `user:<id>`.

Client → server: `conversation:join {conversationId}` (ack `{ok}`; must be participant), `conversation:leave`, `typing {conversationId, isTyping}`, `message:read {conversationId, lastMessageId}`.

Server → client: `message:new Message`, `message:read {conversationId, userId, lastMessageId}`, `typing {conversationId, userId, isTyping}`, `notification:new Notification`, `presence {userId, online}`, `bid:updated Bid`, `agreement:updated {agreementId, status}`.

Messages are **sent via REST** (`POST /conversations/:id/messages`), and the server broadcasts `message:new` to both participants' `user:` rooms.

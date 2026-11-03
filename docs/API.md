# API Contract (v1)

Base URL: `${NEXT_PUBLIC_API_URL}/api/v1`. JSON everywhere. Auth: `Authorization: Bearer <access>`.
Refresh token travels only in the httpOnly cookie `refresh_token` (path `/api/v1/auth`).
Requests from the web app use `credentials: 'include'`.

## Conventions

- IDs: cuid strings. Timestamps: ISO 8601 strings. Money: integer **minor units** (`amountCents`) + `currency` (ISO 4217, default `USD`). Passwords are 8–128 characters and must contain lowercase, uppercase, and numeric characters.
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

| GET   | /users/:id         | public profile `{id, displayName, avatarUrl, bio, location, isBusiness, companyName, ratingAvg, ratingCount, completedCount, createdAt}`                                                                                                                                 |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PATCH | /users/me 🔒       | `{displayName?, bio?, location?, avatarUploadId?, isBusiness?, companyName?}` (avatarUploadId must reference a READY upload owned by user with purpose AVATAR, or null to clear; others rejected with 400; user responses return avatarUrl as presigned GET URL or null) |
| GET   | /users/:id/reviews | paginated reviews received                                                                                                                                                                                                                                               |

## Uploads

| POST | /uploads/presign 🔒 | `{purpose: 'LISTING_IMAGE'|'LISTING_ATTACHMENT'|'BID_ATTACHMENT'|'MESSAGE_ATTACHMENT'|'DELIVERABLE'|'AVATAR', fileName, mimeType, sizeBytes}` → `{uploadId, url, headers, key, expiresAt}` (validates MIME allowlist + size per purpose; key format: `${purpose.toLowerCase()}/${userId}/${cuid}/${sanitizedFileName}`) |
|---|---|---|
| POST | /uploads/:uploadId/complete 🔒 | owner only; verifies object exists in S3 via `headObject` and size/content-type match presigned parameters (else 400); already READY returns 409; marks upload ready (status READY), returns `Attachment {id, key, url, fileName, mimeType, sizeBytes}` |
| GET | /uploads/:id/url 🔒 | short-lived (300s) presigned GET URL (authorization: uploader, admin, OR the upload is attached to a publicly visible listing [OPEN/IN_PROGRESS/COMPLETED/CLOSED], OR to a listing/bid/message/deliverable where the requester is an authorized participant; else 404) |

Limits: images (jpeg/png/webp/gif) ≤ 10 MB; documents (pdf, docx, xlsx, txt, zip) ≤ 25 MB; voice (webm/ogg/mp4/mpeg audio) ≤ 10 MB.
File names are sanitized on presign (path separators stripped, control characters removed, length capped, extension preserved).
Scheduled lifecycle cleanup of uncompleted PENDING uploads is out of scope and should be managed via S3 bucket lifecycle rules or background cleanup workers.

## Categories

| GET               | /categories                | tree `[{id, name, slug, parentId, description, listingCount, children: [...]}]` (counts OPEN listings including all descendants; cached in Redis with automatic invalidation on admin writes and listing lifecycle events [create, update, close, delete])                          |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST/PATCH/DELETE | /admin/categories[/:id] 👑 | `{name, slug, parentId?, description?}`; slug must be unique (409); parentId if provided must exist (400); cycles prevented (a category cannot become its own descendant, 400); delete fails with 409 if category has subcategories or if category or its descendants have listings |

## Listings

| GET | /listings | filters: `q` (Postgres full-text using GIN index: `websearch_to_tsquery('simple', ...)` with ranking when sort is relevance), `kind` (REQUEST/OFFER), `categoryId` / `categorySlug` (includes all descendants), `minPrice` / `maxPrice` (interval overlap semantics on `[priceMinCents, COALESCE(priceMaxCents, priceMinCents)]`), `currency`, `location` (case-insensitive substring contains), `status` (default OPEN; when `ownerId=me` without explicit status returns all of the caller's own listings regardless of status; non-admins may only query OPEN/IN_PROGRESS/COMPLETED/CLOSED or their own via `ownerId=me`), `ownerId`, `sort=newest|price_asc|price_desc|ending_soon|most_bids|relevance` (when `sort=relevance` is requested without `q`, it normalizes to `newest` for cursor encode/decode and order-by), `cursor`, `limit` → paginated `ListingSummary` (each summary enriched with `thumbnailUrl` [presigned GET URL of first image by position, or null], `categoryName`, and owner public profile with presigned `avatarUrl`). Listings with `status: OPEN` that are expired (`expiresAt <= NOW()`) are excluded from default browse and active OPEN queries. Stable cursor pagination uses compound base64url JSON cursors `{"s": "<sort>", "v": <sortValue>, "id": "<listingId>"}` |
|---|---|---|
| GET | /listings/:id | optional auth: valid token → user, no token → anonymous, invalid token → 401; returns `ListingDetail` (extends `ListingSummary` with `categoryName`, `thumbnailUrl`, owner public profile with presigned `avatarUrl`, category, images and attachments with ids and presigned URLs, `bidCount` [counts active: PENDING/SHORTLISTED/COUNTERED + ACCEPTED], and `myBid` [current user's active bid: PENDING/SHORTLISTED/COUNTERED, with bidder presigned `avatarUrl`] if authed); DRAFT and REMOVED only visible to owner or admin (else 404) |
| POST | /listings 🔒 | owner = current user; categoryId must exist; price rules: FIXED requires `priceMinCents` (no `priceMaxCents`), RANGE requires `priceMinCents <= priceMaxCents`, NEGOTIABLE neither; imageIds / attachmentIds must be READY uploads owned by user with purpose `LISTING_IMAGE` / `LISTING_ATTACHMENT`, attached to at most one listing; status DRAFT\|OPEN (default OPEN) |
| PATCH | /listings/:id 🔒 owner | owner (or admin); forbidden when IN_PROGRESS/COMPLETED/REMOVED (409); status changes restricted to DRAFT→OPEN, OPEN→DRAFT rejected when bids exist (409), reopening CLOSED returns 409; admin PATCH validates uploads against listing owner; same price and upload validation |
| POST | /listings/:id/close 🔒 owner | owner; OPEN → CLOSED (conditional write); pending/shortlisted/countered bids declined in a single transaction |
| DELETE | /listings/:id 🔒 owner | owner; allowed only when listing is DRAFT or has zero bids (conditional write; never deletes bids for non-DRAFT listings), else 409 |

## Bids

| GET | /listings/:id/bids 🔒 | owner sees all (sort: `amount_asc|amount_desc|delivery|rating|newest`); bidder sees only own (returns 404 if caller has no bids on the listing) |
|---|---|---|
| POST | /listings/:id/bids 🔒 | `{amountCents, currency, deliveryDays, message(≤5000), attachmentIds?}`; 409 if own listing / not OPEN / already has active bid |
| GET | /bids/mine 🔒 | my bids with listing summary, filter `status` |
| GET | /bids/:id 🔒 | bid + revision history (owner or bidder) |
| PATCH | /bids/:id 🔒 bidder | edit while PENDING/SHORTLISTED/COUNTERED → creates BidRevision; editing resets status to PENDING |
| POST | /bids/:id/withdraw 🔒 bidder | → WITHDRAWN |
| POST | /bids/:id/shortlist 🔒 owner | → SHORTLISTED |
| POST | /bids/:id/reject 🔒 owner | `{reason?}` → REJECTED |
| POST | /bids/:id/counter 🔒 owner | `{amountCents, deliveryDays, message}` → COUNTERED (revision by owner) |
| POST | /bids/:id/accept-counter 🔒 bidder | accepts owner's counter → bid amount updated, status ACCEPTED, agreement created |
| POST | /bids/:id/accept 🔒 owner | → ACCEPTED; listing IN_PROGRESS; other active bids DECLINED; Agreement + Conversation created. Returns `{bid, agreement}` |

Bid statuses: `PENDING, SHORTLISTED, COUNTERED, ACCEPTED, REJECTED, WITHDRAWN, DECLINED`.

## Conversations & messages

| GET  | /conversations 🔒                 | my conversations with `otherParticipant, lastMessage, unreadCount, listing?, agreementId?`; descending last activity with opaque base64url `{date,id}` cursor |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST | /conversations 🔒                 | `{recipientId, listingId?, bidId?}` → existing or new (dedup on participants+listing)                                                                         |
| GET  | /conversations/:id 🔒 participant |                                                                                                                                                               |
| GET  | /conversations/:id/messages 🔒    | cursor paginated, newest first                                                                                                                                |
| POST | /conversations/:id/messages 🔒    | `{type: 'TEXT'                                                                                                                                                | 'IMAGE' | 'FILE' | 'VOICE', body?, attachmentIds?, voiceDurationSec?}` |
| POST | /conversations/:id/read 🔒        | `{lastMessageId}` marks read                                                                                                                                  |

## Agreements (transactions)

| GET | /agreements 🔒 | mine, filter `status`, `role=buyer|provider` — returns paginated agreement summaries (lighter summary shape without deliverable attachments or presigned URLs) |
|---|---|---|
| GET | /agreements/:id 🔒 participant | detail: parties (`buyer`, `provider`), listing (summary), bid, milestones, deliverables (with presigned attachment URLs), timeline (`events`), conversationId, `myRole`, `myConfirmation` |
| POST | /agreements/:id/milestones 🔒 participant | `{title, amountCents?, dueDate?}` |
| PATCH | /agreements/:id/milestones/:mid 🔒 participant | `{title?, status?: 'PENDING'|'IN_PROGRESS'|'DONE'}` |
| POST | /agreements/:id/deliverables 🔒 provider | `{note, attachmentIds}` → status DELIVERED (attachments cannot be reused across deliverables) |
| POST | /agreements/:id/deliverables/:did/accept 🔒 buyer | |
| POST | /agreements/:id/deliverables/:did/request-revision 🔒 buyer | `{note}` → ACTIVE |
| POST | /agreements/:id/complete 🔒 participant | records confirmation; when both confirmed → COMPLETED, listing COMPLETED; allowed from ACTIVE or DELIVERED and is idempotent for a party already confirmed; returns 409 if concurrent cancel won |
| POST | /agreements/:id/cancel 🔒 participant | `{reason}` → CANCELLED; listing → CLOSED (rejected with 409 from DISPUTED) |
| POST | /agreements/:id/dispute 🔒 participant | `{reason}` → DISPUTED (creates admin report; rejected with 409 from DISPUTED) |
| POST | /agreements/:id/reviews 🔒 participant | `{rating 1..5, comment?}` only when COMPLETED, once per party |

Roles and Authorization:

- In a `REQUEST` listing the owner is **buyer** and bidder is **provider**; in an `OFFER` listing the owner is **provider** and bidder is **buyer**.
- Role-restricted actions: a participant attempting the other role's action (buyer submitting deliverable; provider accepting deliverable or requesting revision) receives **403 Forbidden**. Non-participants receive **404 Not Found**.

## Notifications

| GET  | /notifications 🔒              | paginated, `?unread=true` |
| ---- | ------------------------------ | ------------------------- |
| GET  | /notifications/unread-count 🔒 | `{count}`                 |
| POST | /notifications/:id/read 🔒     |                           |
| POST | /notifications/read-all 🔒     |                           |

Types: `BID_RECEIVED, BID_UPDATED, BID_COUNTERED, BID_ACCEPTED, BID_REJECTED, MESSAGE_RECEIVED, DELIVERABLE_SUBMITTED, DELIVERABLE_ACCEPTED, REVISION_REQUESTED, AGREEMENT_COMPLETED, AGREEMENT_CANCELLED, REPORT_RESOLVED, REVIEW_RECEIVED`. Shape `{id, type, title, body, link, readAt, createdAt, data}`.

Unread `MESSAGE_RECEIVED` notifications are coalesced per recipient and conversation: later messages
update the existing notification body, message id and timestamp instead of adding another unread item.

## Dashboard

| GET | /dashboard/summary 🔒 | `{listings: {open, inProgress, completed}, bids: {pending, accepted}, agreements: {active, completed}, unreadMessages, unreadNotifications}` |

Dashboard semantics:

- `agreements.active`: counts agreements in both `ACTIVE` and `DELIVERED` status for the authenticated user.
- `unreadMessages`: counts every message sent by someone else in each conversation the user participates in whose `createdAt` is later than the message referenced by that participant's `lastReadMessageId`; when it is null (or references no row), all messages from other participants count as unread. Messages with the same timestamp as the read marker do not count.

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
Presence is user-level: it becomes online on the first connected tab and offline only after the final
tab disconnects. Presence events go to users sharing a conversation.

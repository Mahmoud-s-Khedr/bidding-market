# Marketplace with Bidding & Integrated Communication — Product Spec

Individuals and businesses publish **listings** of two kinds:

- `REQUEST` — "I need X" (service/product request). Providers/sellers **bid** to fulfil it.
- `OFFER` — "I sell/provide X". Buyers **bid** (make offers) to buy it.

The listing owner compares bids (price, delivery time, provider rating, message), negotiates
(counter-offers), and accepts one. Acceptance creates an **Agreement** (transaction) between the
two parties. Both parties communicate in real time (text, images/screenshots, documents, voice
notes), track milestones, exchange deliverables, and mark the agreement completed, then leave
reviews.

## Roles

- **Guest**: browse/search listings, view public profiles.
- **User**: everything a guest can + create listings, bid, message, manage agreements, report content.
- **Admin**: everything + admin panel (users, categories, listings, reports, platform stats, audit log).

## Feature list (all required for "done")

1. Auth: register, login, refresh (rotating refresh tokens, httpOnly cookie), logout, me. Password
   hashing with argon2. Rate limiting on auth endpoints. Suspended/banned users can't log in.
2. Profiles: display name, avatar, bio, location, business flag + company name; public profile with
   average rating and completed agreement count.
3. Categories: hierarchical (parent/child), admin-managed, slug-based.
4. Listings: kind (REQUEST|OFFER), title, description, category, budget/price (min/max or fixed,
   currency), delivery expectation (days), location (optional), tags, images and attachments,
   status (DRAFT, OPEN, IN_PROGRESS, COMPLETED, CLOSED, REMOVED), expiry date.
5. Search & filtering: full-text (title/description/tags), category (incl. children), kind,
   price range, location, status, sort (newest, price asc/desc, ending soon, most bids). Cursor
   pagination.
6. Bids: amount, currency, delivery days, message, attachments. One active bid per user per listing;
   can edit while PENDING; withdraw; owner can reject, shortlist, counter-offer, accept.
   Counter-offers form a negotiation thread (BidRevision history). Can't bid on own listing or a
   non-OPEN listing. Accepting a bid → listing IN_PROGRESS, other pending bids auto-declined,
   Agreement created, conversation linked.
7. Messaging: 1:1 conversations (optionally tied to a listing/bid/agreement). Message types TEXT,
   IMAGE, FILE, VOICE (with duration). Real-time via Socket.IO (new message, typing, read receipts,
   presence). Unread counts. Attachment upload via presigned S3 URLs with MIME/size validation.
8. Agreements: status ACTIVE → DELIVERED → COMPLETED (or CANCELLED/DISPUTED). Milestones (title,
   amount, due date, status). Deliverables (files + note) submitted by provider; buyer accepts or
   requests revision. Either party can mark complete (requires both confirmations) or cancel with
   reason. Activity timeline.
9. Reviews: after COMPLETED, each party rates the other 1–5 with comment (once).
10. Notifications: persisted + pushed over websocket for: new bid, bid updated/countered, bid
    accepted/rejected, new message, deliverable submitted, agreement status changes, report
    resolved. Mark read / mark all read. Unread badge.
11. Dashboard: my listings (with bid counts), my bids (status), conversations, agreements, stats.
12. Reports & moderation: users can report listing, user, message, bid with reason. Admin queue:
    resolve (dismiss / remove content / suspend user) with note.
13. Admin panel: users (search, suspend, ban, change role), categories CRUD, listings moderation
    (remove/restore), reports queue, platform stats (users, listings, bids, agreements over time),
    audit log of admin actions.

## Non-functional

- Strict TypeScript, no `any`. Input validation on every endpoint (zod). Authorization on every
  resource (owner / participant / admin). Consistent error format.
- Security: helmet, CORS allowlist, rate limiting, upload MIME allowlist + size limits, no secrets
  in repo, SQL only through Prisma.
- Tests: unit tests for services/components, integration tests for every API endpoint against a
  real Postgres, Playwright e2e for the critical user journeys.
- Accessible, responsive UI (mobile first). Clear empty/loading/error states.

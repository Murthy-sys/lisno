# Project chat mention notifications

Status: implemented and verified locally under standing autonomous authorization, Mode A. Independent integrity review has no remaining must-fix findings. [Execution and verification](../plans/2026-09-17-chat-mention-notifications.md). No deployment or real customer email performed.

## Goal and evidence

Every authenticated user has a visible notification bell. Sending a valid project-chat mention creates an in-app alert and an email for every distinct tagged person and the sole active Super Admin. Clicking the alert/email opens the precise message and allows the existing Reply action.

Current code validates mention IDs and spans against current project membership. `project-chat.service.ts` commits immutable messages, operations, audit and events together through the memory/Mongo chat transaction. No global notification inbox or mention email exists. AppShell owns all authenticated screens, but chat hides MobileHeader. The chat already accepts `?message=<id>`, paginates around that message, highlights it and supports replies. ProtectedRoute currently drops query parameters when saving a login return destination. Existing SMTP/SendGrid transports provide safe delivery errors and configuration.

## Requirements and acceptance

1. One notification and email job per message/recipient, including Super Admin oversight; overlapping mentions/Super Admin recipients and repeated sends must deduplicate. Ordinary untagged messages produce no alerts. Explicit self-mentions remain mentions; Super Admin oversight is not excluded when Super Admin authored the message.
2. Notification metadata and durable email intent commit atomically with the message. Email delivery occurs after commit, with bounded retries and leased ownership. Disabled/failed email does not undo the chat. Existing demo-account external-mail protection applies. No exactly-once claim for remote mail acceptance followed by a process crash.
3. Only the recipient can list/read their notifications. Current identity and project membership govern inbox, stream and email delivery. Revoked/deactivated access must not disclose message/project content. A Super Admin sees their own oversight inbox, never another user's private inbox. Ambiguous Super Admin identity fails closed.
4. Bell and unread count are visible on all authenticated workspace and chat screens, desktop and mobile. Accessible popover/dialog lists newest alerts, supports loading/empty/error/retry/read states, and a dismissible top alert announces newly arriving notifications without replaying the initial inbox.
5. One user-scoped authenticated SSE connection delivers snapshots without frequent notification/list HTTP polling; reconnect uses backoff. Hidden/offline lifecycle and logout/account switching clean up connection and private state. Server coalesces changes, uses Mongo change streams where available and bounded recovery, and rechecks session/access. Existing chat-list performance fix remains intact.
6. Click uses `/projects/<encoded-id>/messages?message=<encoded-id>`, marks the recipient notification read, highlights the message, and exposes Reply. Login preserves query/hash. Missing/revoked messages use established non-disclosing chat errors.

## Contract

`GET /notifications?limit=20&offset=0` returns `{items, unreadCount, pagination:{limit,offset,total,hasMore}}`. Item: `{id,type:'chat.mention'|'chat.mention.oversight',projectId,projectName,messageId,actor:{id,name},excerpt,createdAt,readAt:string|null}`. Excerpt is bounded plain text. `PUT /notifications/:notificationId/read` idempotently returns the item. `GET /notifications/events` emits `event: notifications` with the same first-page snapshot and `event: state` with denied state on lost authorization. Normal heartbeat is a comment. Standard API envelopes apply to HTTP only.

Use existing chat permissions and operation registry with recipient-self semantics; synchronize OpenAPI and route inventory. Add indexes for unique recipient/message identity, recipient paging/unread lookup, and pending email claims. No existing data rewrite/backfill is required; notifications begin with newly sent mentions.

## UX and decisions

Reuse shell typography, existing icon/button/dialog patterns and chat deep links. Reserve bell space so content, mobile menu and chat controls never overlap. Preserve 44px targets, visible focus, Escape/outside close and return focus. Use clear text: actor mentioned you in project, or actor mentioned someone in project for oversight. Top alerts are bounded and dismissible; the inbox remains durable.

Recommended durable transactional inbox/outbox with live stream prevents lost alerts after restart and avoids repeated conversation-list requests. An immediate-only email callback would be simpler but loses retry intent; periodic browser inbox polling adds the load the user already reported. Neither is selected.

## Risks, operations and scope

Email sending must revalidate recipient/account/membership and avoid leaking raw provider errors or private URLs in logs. Delivery may be retried after transient failure; remote acceptance plus crash can duplicate an email despite local deduplication. Recheck current recipient email at dispatch. No new dependency expected. Production delivery depends on configured SMTP/SendGrid. No migration, deployment, customer communication, browser push permission or device notification is included. Rollback is code rollback; new additive records can remain unused.

Preserve the ten initially dirty paths from previous chat-performance and sidebar tasks; baseline diff captured at `/tmp/lisno-mention-notifications-qa/initial-worktree.diff`.

## Verified result and rollout limits

Backend: 185/185 and frontend: 371/371 focused/regression tests passed, with both workspace typechecks and production builds. Mongo tests cover transactional rollback/deduplication/leases/access filtering and recipient-specific change-stream updates written through a separate database connection. Actual UI browser checks passed across 320–1440px, including enlarged text, accessible drawer, live alerts, exact-message navigation, quoted Reply and login continuation. An idle visible workspace retained one initial inbox request and one stream over 104 seconds.

No dependency or lockfile changes. Deploy backend before frontend so new notification endpoints are available. Production startup initializes the additive notification indexes and starts durable email recovery using existing SMTP/SendGrid configuration. This work did not deploy, backfill historical mentions, mutate production or send real email. Full unrelated suites, actual provider delivery, process-crash/failover chaos testing and large-inbox load testing were not run. Existing large frontend bundle warning remains; one unchanged LoginPage test logs a missing mock handler warning while passing (baseline execution not performed).

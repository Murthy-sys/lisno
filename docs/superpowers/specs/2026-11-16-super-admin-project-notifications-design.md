# Super Admin project notifications

## Goal and evidence

The user reports HTTP 403 for GET /project-manager/notifications as Super Admin and explicitly requires this role to see these updates. The frontend displays Project updates for pm.notifications.read, which Super Admin has. Both notification list and mark-read route operations nevertheless declare deny_personal. The service also limits events to actor recipientIds and excludes Super Admin from its permitted project roles.

## Behavior and boundaries

Allow the active, uniquely configured Super Admin to oversee delivered project notifications across existing projects. Treat events with a nonempty recipient list as delivered notifications; do not expose undelivered audit-only events. Exclude orphaned/deleted projects. GET is global_read; marking read is self and only adds the current actor's id to readBy. Keep the existing response contract, stable pagination and unread totals, private/no-store caching, active identity validation and transactional mutation authorization fences.

Ordinary roles must continue to require recipient membership and current project access, including reassignment and vendor order revocation checks. Do not grant other Project Manager personal endpoints, impersonate a manager, alter notification recipients or mark another user's notifications read. Existing stored notifications need no migration. Super Admin links open the existing admin project detail page, with All projects wording rather than Your assignments.

## Acceptance and verification

Super Admin list returns 200 with eligible notifications from multiple projects; pagination and unread totals match that scope. Reading one event changes only Super Admin's read state and remains idempotent. Inactive, duplicate or mismatched Super Admin identities cannot gain oversight, and missing/undelivered events return non-disclosing failures. Ordinary roles keep prior access boundaries. Route registry/OpenAPI stay synchronized. Tests cover API middleware, replica-set service behavior and frontend link/receipt behavior; builds and a local read-only endpoint check complete verification. No live read-state mutation, migration, deployment, email or project closure is part of this task.

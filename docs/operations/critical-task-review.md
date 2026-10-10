# Critical task review

The automatic review checks current authorized work once after each successful explicit browser login. It includes open critical chat actions assigned to that team member and overdue incomplete workflow tasks assigned to them, within projects they can access. It does not include every notification and is not available to Clients.

A successful empty check consumes that login's automatic check without opening a dialog. New work still appears through the existing notifications and manual **Critical tasks** action. Reload, navigation, date changes, query invalidation and scheduled daily receipts do not rearm the automatic review. A new successful login may review unresolved work again, including on the same day.

`GET /daily-critical-tasks/current` is an authenticated, no-store, snapshot-only read. It returns current work and an optional reference to the latest existing due receipt. It does not create a daily receipt, backfill history, resolve tasks, mark notifications read or create audit events. Existing scheduled daily delivery and receipt history remain separate. Acknowledgment uses the existing endpoint only when an unacknowledged receipt is present; otherwise the review closes locally.

The browser's `lisno.auth.login-review.v1` record contains only an opaque session ID, account ID, SHA-256 token fingerprint and consumed flag. It is untrusted presentation state, never authorization. Web Locks serialize creation and consumption across same-origin tabs. An explicit login rotates the marker; authenticated restoration preserves it. Replacement markers from another tab require identity and authorization revalidation before adoption. No raw token or task content is stored in the new marker.

If Web Locks, the crypto digest or metadata storage are unavailable, the review falls back to memory in the currently loaded app. Login and manual review continue to work, but reload and cross-tab suppression cannot be guaranteed in that fallback. Clearing browser storage also clears the presentation marker. No database migration or cleanup of historical receipts is required.

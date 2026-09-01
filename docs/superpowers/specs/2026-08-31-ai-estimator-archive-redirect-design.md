# AI Estimator Archive Success Redirect

## Goal

After a Super Admin successfully archives an Estimation Item from its
Configuration workspace, return the user to the AI Estimator Configuration
dashboard instead of leaving them on the archived, read-only item page.

## Current behavior and evidence

- The Estimation Item workspace is routed at
  `/admin/configuration/estimation/items/:itemId`.
- The Configuration dashboard/AI Estimator Knowledge Base is routed at
  `/admin/configuration/estimation`.
- `KnowledgeItemWorkspacePage` uses one lifecycle mutation for activate,
  deactivate, and archive. On success it synchronizes lifecycle caches, closes
  the dialog, clears local dirty state, and announces the action, but it does
  not navigate after archive.
- Successful duplication already performs explicit navigation, so the
  workspace has an established React Router navigation dependency.
- Basket archive occurs from the Configuration dashboard itself, while reusable
  value archive occurs on its own management page. Neither flow currently
  leaves the user on an archived Estimation Item workspace.

## Scope

- Change only successful Estimation Item archive behavior in
  `KnowledgeItemWorkspacePage`.
- After cache synchronization succeeds, navigate to
  `/admin/configuration/estimation`.
- Replace the archived workspace history entry so browser Back does not return
  the user directly to the just-archived item page.
- Add a focused rendered navigation regression test.

## Non-goals

- No change to Basket archive, reusable-value archive, permanent Basket
  deletion, activation, deactivation, duplication, or Draft creation.
- No backend, API, authorization, persistence, audit, or archive semantics
  change.
- No new notification system or dashboard redesign.
- No deployment, commit, push, seed, migration, or live archive operation.

## Requirements

1. A successful Estimation Item archive must first complete the established
   lifecycle cache synchronization.
2. It must then navigate to `/admin/configuration/estimation` using history
   replacement.
3. Activate and deactivate success must remain on the current workspace and
   retain their existing announcements.
4. Archive validation, authorization, version-conflict, network, or other
   mutation failures must leave the user on the workspace with the existing
   dialog/error behavior; no redirect occurs.
5. The redirect must not occur before the archive response succeeds.
6. Existing unsaved-change and lifecycle-confirmation protections remain
   unchanged.

## Assumptions

- “Archive” means the Estimation Item/Main Line archive action visible in the
  item workspace. This is the only archive flow that currently succeeds while
  leaving the user on an archived configuration detail page.
- “Configuration dashboard” means the registered Super Admin AI Estimator
  Knowledge Base route `/admin/configuration/estimation`.

## Constraints

- Preserve the current dirty worktree, including the approved Mode/layout and
  permanent Basket deletion work.
- Use the existing `navigate` function and lifecycle cache synchronization; do
  not add dependencies or alter shared routing primitives.
- Backend authorization and archive transaction behavior remain authoritative.

## UX, data, and API impact

- UX: successful Estimation Item archive ends on the Configuration dashboard;
  failed archive remains in context for correction/retry.
- Data: none beyond the existing archive mutation.
- API: unchanged.
- Authorization: unchanged; the existing lifecycle permission remains
  authoritative.

## Risks and mitigations

- **Redirect before cache state is current:** await existing lifecycle cache
  synchronization before navigation.
- **Back navigation returns to archived detail:** use history replacement.
- **Other lifecycle actions redirect unexpectedly:** branch explicitly on the
  successful `archive` action and cover activate/deactivate with regression
  assertions.
- **Failure hides useful context:** navigate only from the mutation success
  handler.

## Acceptance criteria

1. From an Estimation Item workspace, confirming a successful archive redirects
   the Super Admin to `/admin/configuration/estimation`.
2. The redirect uses replace semantics and occurs only after the successful
   archive response and cache synchronization.
3. A failed archive remains on the item workspace and shows the established
   error state.
4. Activate and deactivate do not redirect to the Configuration dashboard.
5. Focused workspace/navigation tests, the AI Estimator feature suite, frontend
   typecheck, production build, and `git diff --check` pass, subject to the
   already documented unrelated backend teardown limitation.

## Open decisions

None. The existing route registry and current archive behavior identify one
unambiguous target and one localized success branch.

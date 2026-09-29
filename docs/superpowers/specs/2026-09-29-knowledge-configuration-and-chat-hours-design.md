# Knowledge configuration and internal chat hours

Date: 2026-09-29  
Status: Approved

## Goal

Make the five requested changes in the web frontend and corresponding mobile flows: simplify UOM creation, create whole Sub-Basket recommendation targets without a placeholder item, place the Mode description inside PMC, show the Main Basket → Sub-Basket → item hierarchy, and provide scheduled internal chat hours with a daily critical task list.

## Current behavior and evidence

1. The web UOM side panel always requires `Code` in `KnowledgeMasterEditorDialog.tsx`; mobile has the same requirement in `KnowledgeOverviewEditor.tsx` and `KnowledgeReusableValues.tsx`. The create route's UOM schema requires `code`, and `createMaster` rejects an omitted code. Other master types already demonstrate backend-generated codes.
2. The web Whole Sub-Basket shortcut opens `CreateKnowledgeItemDialog` in `sub-basket` context and saves a temporary item with the new Sub-Basket. A separate `CreateKnowledgeSubBasketFields` component already creates an empty Sub-Basket. A rule already has stable `targetKind: "sub_basket"` and `targetSubBasketId`, but backend reference validation and mobile catalog validation reject a selected Sub-Basket with no children. The backend context resolver already marks such a target unavailable until children exist.
3. Web `KnowledgeModeConfigurationBuilder` and mobile `KnowledgeModeEditor` render `Shared description` above the PMC and Execution sections. It persists as `advanced.modeDescription`; generation and synchronization currently include PMC and In-house text. The saved summary also labels it `Mode · Shared description`.
4. Web `KnowledgeBaseIndexPage` groups item cards directly under Main Baskets; mobile `KnowledgeCatalogWorkspace` and `KnowledgeBasketCarousel` do likewise. Item records carry `subBasketId` and `subBasketName`, and a separate Sub-Basket list API exists. Items may also belong directly to a Main Basket.
5. Project chat currently permits writes whenever role and membership checks pass. It has `critical` messages, tracked actions, responsible users, due dates, and read-only GET flows. Workflow tasks have `assigneeUserId`, completion status and `dueAt`; legacy rows use the existing `workflowTaskDueAt` fallback. Existing notifications are chat-mention shaped and do not represent a daily task digest. Web and mobile chat have separate composers.

The three screenshots in the request show the temporary-item field to remove, the desired description location, and the desired nested catalog disclosure.

## Scope and behavior

### 1. UOM code

- Hide Code in UOM add and edit controls on web and mobile, including item quick-add and reusable-value management. Keep Name, quantity decimal places, and existing ancillary fields.
- Make UOM `code` optional on create in the API and shared client contract. Generate a unique, stable internal code on the backend when omitted, using the new UOM ID rather than the display name. Preserve existing codes and continue accepting explicit codes from older API clients. UI edits omit `code`, leaving stored codes unchanged.
- Other reusable-value code fields and their validation remain as they are. Codes may remain visible in directory read views; this request concerns the entry controls.

### 2. Whole Sub-Basket recommendation

- The Add Sub-Basket action from a Whole Sub-Basket rule asks for Main Basket and Sub-Basket name only. It uses the existing empty Sub-Basket create operation and selects the returned stable Sub-Basket ID in the draft rule. It creates no temporary or other item. Saving the catalog value and saving the source item's recommendation remain separate, with clear success/retry states.
- The saved rule remains `targetKind: "sub_basket"`, `targetMainLineId: null`, and `targetType: null`; matching is by Sub-Basket ID and applies to **all eligible current and future items** in that Sub-Basket. Item-target rules retain their existing behavior.
- Permit an active rule to reference a valid empty Sub-Basket. Show it as “Needs items” in configuration; the recommendation engine treats it as unavailable and emits no item recommendation until eligible active children exist. Draft or incomplete children continue to require completion before usable AI recommendations. Do not create or infer a placeholder child.
- Keep the existing parent match, source-item cycle, duplicate-rule, authorization, and concurrent catalog-update safeguards. Mobile's existing standalone Sub-Basket creation path must use the same empty-target rule behavior.

### 3. PMC description

- Render the existing description editor inside the expanded PMC section, before PMC calculations, with the visible label **Description**. Apply the same placement and label on mobile and in saved quick review where the field appears.
- Retain the stored `modeDescription` field, existing text, generation, PMC/In-house synchronization, unsaved-change protection, and validation. This is a presentation change, with no rewriting of saved revisions. If validation points to the description while PMC is hidden/collapsed, reveal PMC and focus the description.

### 4. Catalog hierarchy

- On web and mobile, opening a Main Basket shows its Sub-Baskets. Opening a Sub-Basket shows its item cards. Show empty Sub-Baskets. For legacy/direct items without a Sub-Basket, show a clearly named **Items directly under Main Basket** disclosure so they remain reachable.
- Preserve existing item and basket actions, ordering, filters, search and pagination. A search result shows its ancestor path. Counts must state whether they are totals or items on the loaded page; never present an off-page branch as truly empty. Loading/error states for the Sub-Basket list include retry and do not hide known items.
- Disclosure buttons have names, `aria-expanded`, keyboard operation and visible focus. Nesting remains usable at narrow mobile widths.

### 5. Internal chat hours and 17:00 digest

- Time zone: **Asia/Kolkata**, every calendar day. Internal roles are all authenticated roles except `client`. At 20:00 internal chat becomes read-only; at 07:30 it becomes writable again. Clients' existing chat permissions are unchanged.
- During read-only hours, internal users can read conversations, attachments and the critical task list and can mark messages/notifications read. Preserve unsent drafts. Pause sends, issue/status changes, new uploads, typing and chat-management edits. Server-side checks enforce this at the mutation boundary; web/mobile show the schedule, a clear disabled state and next opening time. Upload cleanup/discard remains possible. Requests crossing 20:00 must not commit a forbidden chat change. Keep the existing role, membership and operation checks.
- At 17:00, each active internal user receives one in-app daily critical list, whether online then or opening the app later. The list contains (a) their open `critical` tracked chat actions for projects they can still access, where they are the responsible user, and (b) their incomplete personally assigned workflow tasks whose authoritative deadline is past due. Use the backend deadline or the existing legacy deadline derivation; do not calculate a substitute in the UI. No tasks yields an explicit empty list.
- Present the daily list prominently on web and mobile and require the user to view and acknowledge it once per India-local date. Persist per-user/date delivery and acknowledgment so reloads, multiple devices, process restarts and concurrent instances do not duplicate or lose the prompt. Acknowledgment confirms viewing, not task completion. The list remains reachable after acknowledgment and overnight. A scheduled event refreshes online clients; a server-side catch-up path covers missed scheduler runs and offline users.
- Query task contents under current authorization on every view, so revoked project access or reassignment cannot leak details from a prior digest. Notification payloads contain no private task content until authenticated retrieval. This work adds no email or device push delivery.

## Contract, state and failure handling

- UOM create accepts omitted `code` and returns the generated code in the existing response shape. Unique code/name constraints remain authoritative; existing UOMs need no migration.
- Sub-Basket recommendation validation accepts a real empty Sub-Basket ID, while target resolution reports zero available children and no AI suggestion. A later eligible child is picked up through the same Sub-Basket ID. Existing rules and section versions remain intact; no backfill or rewrite is planned.
- Daily digest uses a distinct persisted receipt keyed by `(userId, India-local date)`, with `createdAt` and `acknowledgedAt`, and an authorized list/read/ack API. Reuse existing notification streaming only for a content-free refresh signal or add an equivalent scoped event. Update the route-operation registry, frontend/mobile API types, and OpenAPI inventory for new protected endpoints.
- A shared backend schedule predicate uses an injected clock in tests and returns the next opening. The response exposes enough schedule state for web/mobile controls, while backend mutation checks remain authoritative. Denials use a stable error code and retry time; drafts stay on the device. Only chat-specific mutations are gated; unrelated project, procurement and workflow APIs continue under their existing permissions.
- If the digest query fails, do not record it as viewed or show a false empty list. Retry without duplicate receipts. If an action is resolved or a task completed after 17:00, the next authorized read reflects the latest state. Delivery/ack timing is auditable without storing private content in the receipt.

## Assumptions and decisions

- The user's prior mobile parity requests and the existence of equivalent mobile controls mean all applicable knowledge and chat UI changes cover both platforms.
- The user selected the combined critical chat-action and overdue assigned-workflow-task list, and selected overnight read access with writes paused.
- An empty newly created Sub-Basket may have a saved whole-basket rule, but AI suggestions wait for eligible items. This avoids inventing a temporary item and preserves the stable Sub-Basket target.
- The 17:00 delivery is in-app, including next-open catch-up, because no email or device push channel was requested.
- The Mode description keeps its present shared storage and text synchronization; only its presentation moves into PMC.

## Risks and verification criteria

1. UOM creation succeeds without entering a code on web and mobile, returns a unique backend code, retains existing codes on edit, and still supports legacy API callers supplying a code.
2. Whole Sub-Basket Add creates only a Sub-Basket, saves an empty target rule without an item ID, shows “Needs items,” then covers multiple subsequently added eligible items. Invalid parent, source containment, duplicate rule and refresh-failure cases remain safe.
3. Description appears under PMC as “Description” on both platforms; previous saved text, In-house synchronization, validation focus and quick review remain accurate after reload.
4. Both platforms disclose Main Basket → Sub-Basket → items; empty and direct-item cases, search, pagination, keyboard/screen-reader behavior and narrow layouts work.
5. Boundary tests at 19:59, 20:00, 07:29 and 07:30 India time prove backend rejection/acceptance, client read access, preserved drafts, client-role exception, and race behavior. All chat write routes and both mobile/web controls obey the same rule.
6. At 17:00 a user with two unequal projects sees only their own open critical tracked actions and overdue assigned workflow tasks, once per date and device group. Offline catch-up, reassignment, revoked access, no-task, query-failure, multi-instance idempotency and acknowledgment persistence are covered. No task detail is exposed across users or projects.

## Out of scope

No change to existing client chat hours, task priorities, task completion rules, UOM display names, saved Mode revisions, historical catalog classification, customer email, device push, production migration, deployment or data backfill.

## Open decisions

None blocking. Approval of this specification confirms the stated in-app delivery, all-day calendar schedule and empty Sub-Basket rule behavior.

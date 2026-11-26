# Multiple Designer requests and compact suggestion cards

Date: 2026-11-25
Status: Implemented, verified, and enabled on the approved local database
Scope: Super Admin Designer assignments, request decisions, and related projections

## Goal and confirmed decision

Super Admin can send assignment requests to multiple Designers for the same project. Display suggested Designers as simple cards, four per row on desktop.

The user confirmed: **the first Designer to accept gets the assignment and the other pending requests close automatically.** “First” means the first valid acceptance committed by the backend, including when two Designers respond concurrently.

This specification supersedes only the single-pending-request restriction and suggestion-list presentation in `2026-11-25-designer-recommendations-client-handoff-design.md`. Existing ranking, Client handoff, kickoff requirements, and appointment behavior remain applicable.

## Current behavior and evidence

- `backend/src/models/DesignerAssignmentRequest.ts` declares the partial unique index `one_pending_designer_request_per_project` on `projectId` while status is `pending`.
- `backend/src/services/designer-assignment.service.ts` rejects creation whenever any pending request exists for the project. Suggestions expose a singular `pendingRequest` and block further requests globally.
- The same service accepts one request through the existing transactional assignment helper, but does not close competing requests because the current model forbids them.
- `frontend/src/features/admin/DesignAssignmentPanel.tsx` disables every send button when `data.pendingRequest` exists. It renders one global cancellation action and full-width Designer entries.
- `frontend/src/features/designer/designerHandoff.css` uses a full-width list with details and an action column.
- Assignment evidence, memory repository fixtures, and project-status projection assume one pending request. They must not select an arbitrary Designer after this change.
- The repository already has explicit, dry-run-first index migration utilities, including `backend/src/migrations/project-purchase-order-request-index.ts`. Changing a Mongoose schema declaration alone does not remove an existing database index.

## Required behavior

### Requests and assignment

1. Permit pending requests to different active, eligible Designers for one project. Keep a maximum of one pending request per project/Designer pair.
2. Sending a request to one Designer must not disable sending to other eligible Designers after that mutation completes.
3. Retain source-revision validation, request version checks, and idempotency. A retry must not create another request or duplicate assignment effects.
4. The first valid acceptance assigns that Designer and closes every other pending request for the same project in the same transaction. This applies to pending requests from older source revisions as well.
5. A later acceptance of a closed request returns a clear conflict indicating that the request is no longer available. It cannot replace the assigned Designer, create duplicate tasks, or gain project access.
6. A failed or rolled-back acceptance leaves the assignment and competing requests unchanged.
7. Declining or cancelling a request affects only that request. Other pending requests remain actionable subject to their existing source validation.
8. Preserve the current assigned Designer while replacement requests are pending. A successful replacement acceptance changes the assignment atomically.
9. A later deliberate reassignment remains possible through a fresh request using the current source revision. A stale concurrent create must not silently become a request to replace the winner.
10. Preserve approved estimate and design history, assignment audit identity, deterministic downstream tasks, original deadlines, and any already-confirmed key-collection appointment. Both kickoffs remain required before key collection.

### Super Admin cards

- Four equal-width cards per row at desktop widths, two on tablet, and one on narrow mobile screens. Use the available assignment-panel width to avoid cramped cards or horizontal scrolling.
- Keep the existing product typography, restrained borders, and surface colors. No new decorative icons, shadows, gradients, animation, or dependencies are required.
- Each card shows the Designer name, number of projects handling, preferred language, known languages, location, and concise match information. Unknown values remain explicit.
- Each Designer has an individually identified action: **Send assignment request**, or a **Request sent** state with **Cancel request** when their request is pending. Clearly identify the currently assigned Designer.
- Use stable Designer IDs to associate requests with cards. Search and pagination must not lose pending requests or cancel the wrong request.
- Keep a compact pending-request summary accessible independently of the current search/page, with individually labelled cancellation controls. Other eligible cards remain available.
- Retain the existing ranking, search, pagination, loading, empty, permission, retry, and stale-source states. Preserve keyboard access, visible focus, meaningful button names, and readable long names/language lists.
- Refresh suggestions, assignment evidence, project status, Designer inbox, and related existing queries after mutations. Existing polling must reconcile acceptance from another session.

### Designer and Client behavior

- Each Designer can see and respond only to their own request, using the current limited preview before acceptance.
- When another Designer wins, the losing request is closed and can no longer be accepted. A stale open screen receives an understandable message and refreshes its data.
- A closed request may expose its closure reason to its recipient, but must not disclose the winning Designer or other candidates through that reason.
- Pending candidates receive no project membership or broader Client/project access.
- Client screens continue to show the accepted Designer only. Their phase panels, scheduling options, countdown start, and kickoff gates remain unchanged.

## Data, API, and transaction design

### Request records and history

Keep existing immutable request identities and source snapshots. Reuse terminal status `cancelled` for automatically closed competitors, with a typed nullable closure reason distinguishing `assigned_elsewhere` from an explicit Super Admin cancellation. Historical rows without this new field remain readable and are not rewritten.

Automatic closure must preserve truthful causality: record the accepting event/time and an audit reason, without fabricating a cancellation performed by Super Admin. Do not copy the winning request's decision idempotency key onto other requests. Only the winning request records that Designer's acceptance decision.

### Collections and projections

- Replace the old partial unique index with a named partial unique index on `{ projectId: 1, designerId: 1 }` for pending rows.
- Suggestions expose `pendingRequests` as a collection covering the project, independent of the current Designer search/page. Per-card state is derived by stable Designer ID.
- `canRequest` represents project/source eligibility, rather than the absence of all pending requests. A duplicate target is blocked individually.
- Update shared TypeScript types, runtime serialization/validation, OpenAPI, fixtures, and all current consumers together.
- Preserve the old singular response field temporarily only as a deprecated compatibility projection: the sole pending request when exactly one exists, otherwise `null`. Current consumers use the plural collection exclusively; no arbitrary first request is used.
- Internal assignment evidence becomes plural in both memory and Mongo paths. Project status accurately represents awaiting Designer responses. Super Admin may see the pending candidates; other viewers retain the existing non-disclosing status behavior. Pending candidates are never added to membership participants.
- Keep the existing create, cancel, and decision endpoints; a bulk-send endpoint is unnecessary for independently actionable cards.

### Concurrency and failure handling

Use the existing Mongo transaction and project coordination mechanisms to serialize assignment-changing acceptance against competing acceptance and request creation. Source validation, accepted assignment effects, winner decision, sibling closures, and audits commit together.

Request creation and acceptance racing on an old source must not leave a new actionable request after the winner commits. Cancellation/decline races must resolve through transaction and version checks without converting an already terminal request into a different terminal state. Retrying the winner's successful acceptance with the same idempotency key returns its original success.

Retain active-role and source checks at mutation time. An inactive Designer, inactive proposing Super Admin, changed source, or invalid version cannot win the assignment. Existing structured errors remain safe and actionable.

## Permissions and side effects

| Actor | Allowed actions |
| --- | --- |
| Active Super Admin with the existing operation permission | Inspect suggestions and project request history; create requests; cancel individual pending requests |
| Active target Designer | Read their limited request preview; accept or decline their own eligible pending request |
| Other Designer or role | No access to another Designer's private request decision or candidates |
| Client | See the accepted Designer and existing handoff state |

No permission expansion, email delivery, notification channel, new financial calculation, or direct-assignment bypass is introduced. Existing audit actions should distinguish automatic closure in their structured metadata. If a separate audit action is necessary, keep the canonical action inventory and its tests synchronized.

## Existing database compatibility and rollout

An existing database may retain `one_pending_designer_request_per_project`; runtime code and schema edits alone cannot enable multiple requests there.

Prepare a narrowly scoped, idempotent index transition using repository conventions:

- Dry-run by default against an explicitly selected database, with expected index-definition checks and duplicate pending project/Designer reporting.
- Require verified backup, captured index metadata, quiesced assignment writes, and a final clean dry run before applying it.
- Build and verify the replacement pair index before removing the exact legacy index. Never call broad `syncIndexes`, drop unrelated indexes, delete requests, or migrate automatically at startup.
- Refuse unexpected index definitions or conflicting data with a useful report. Do not silently resolve conflicts.
- Rollback must first verify that each project has at most one pending request, rebuild the legacy index, then remove the replacement. If multiple requests exist, stop and require explicit reconciliation; never discard history automatically.
- Coordinate application rollout with the index transition. Old application instances must not continue creating the legacy index or handling decisions with single-request assumptions.

Migration preparation and isolated replica-set tests are in implementation scope. Execution against an existing local or deployed database requires explicit authorization of that exact action and target under repository policy. Do not claim the feature is enabled on that database until the transition and runtime verification actually occur.

## Scope boundaries and assumptions

- No changes to ranking order, text-based location matching, language configuration, workload calculations, pricing, PDF styling, procurement, or other prior features.
- No bulk selection/send interface: the user requested sending to multiple Designers through their individual cards.
- Four cards refers to a desktop assignment panel with sufficient width; responsive reductions preserve usability.
- Existing source rules decide when assignment/reassignment is permitted. Multiple requests do not bypass those rules.
- Existing dirty work from the completed handoff and user-profile features must be captured and preserved before implementation.
- No unresolved product decision remains. The first-acceptance behavior was explicitly confirmed by the user.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Two or more distinct Designers can have pending requests for the same eligible project; duplicate target requests are prevented. | Service/API and replica-set tests including retries and duplicate-key handling |
| AC2 | Concurrent valid acceptances produce one assigned Designer, one winner decision, and closed competitors without duplicate assignment effects. | Replica-set race, rollback, and idempotency tests |
| AC3 | Creation, cancellation, decline, and acceptance races preserve source/version rules and truthful terminal states. | Focused interleaving and stale-source regressions |
| AC4 | Pending requests grant no membership; only the correct Designer can decide; current assignment and existing appointment remain intact until a valid replacement. | Asymmetric actor/project authorization and handoff regressions |
| AC5 | Cards render four across on desktop, two on tablet, and one on mobile, without overflow. Independent send/cancel actions work across search/pages. | Rendered interactions and visual checks in the real Admin section at representative widths, with keyboard and accessible-name checks |
| AC6 | Suggestions, Designer inbox, and project status reconcile multiple pending requests and the winning acceptance without arbitrary ownership or candidate disclosure. | Contract, projection, repository, cache-refresh, and UI regressions |
| AC7 | Existing pending/history data survives the index transition. Apply is repeatable, dry-run is read-only, and unsafe rollback/index definitions are refused. | Isolated replica-set migration tests and documented rollout evidence |
| AC8 | Integrated frontend/backend compile and build; unrelated work remains untouched. | Relevant focused suites, both typechecks/builds, `git diff --check`, and final diff/status inspection |

Do not run live requests, production mutations, customer communications, seed scripts, commits, pushes, or deployment as part of these checks. Record exact checks, any unrelated existing failures, and unperformed runtime/index actions in the final implementation handoff.

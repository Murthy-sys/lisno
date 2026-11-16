# Vendor login workflow visibility and styling preservation

Date: 2026-11-14
Status: Approved by the user on 2026-11-14. Task plan approved and Mode A implementation authorized on 2026-11-15.
Classification: Substantial frontend workflow presentation change, using existing backend contracts.

## Goal and confirmed scope

Maintain the visual quality and established styling of the vendor login screens while making assigned work, progress updates and reviews clear and actionable.

The user explicitly selected **Vendor login screens: assigned work, progress and reviews**. Procurement's vendor directory and vendor administration are outside this scope.

A vendor should immediately understand the current stage of an assignment, what was last reported, what they can do next, and which next step depends on someone else. Styling preservation is a release requirement alongside functional correctness.

## Current behavior and evidence

Source inspected on 2026-11-14. The initial worktree was clean. These findings are from code inspection; a rendered visual baseline has not yet been captured.

| Area | Current evidence | Implication |
| --- | --- | --- |
| Entry point | `frontend/src/app/router.tsx` mounts `VendorWorkPage` at `/vendor`. `VendorWorkPage.tsx` combines Project notices with `VendorExecutionWorkspace`. | Extend the existing vendor workspace and retain its routing and notices. |
| Assigned work | `frontend/src/features/execution/ExecutionWorkspace.tsx` renders server counts, filters, project identity, a shared assignment table, status, next owner, daily reporting and committed dates. The row action is a generic Open button. | Workflow information exists, but vendors must combine information across columns and the detail panel to understand their next step. |
| Detail and actions | `ExecutionDetailPanel.tsx` provides workflow commands, evidence, approved orders and activity history. Vendor detail uses the non-compact view. Next action controls follow a long facts section, notes, the approved-order disclosure and evidence. | Place a concise workflow explanation early while retaining the established panel and forms. |
| Report lineage | `ExecutionWork.latestVendorReport` contains the current-round vendor report, reason and next action. Detail currently uses this object only in compact mode; the vendor view shows `latestNote` as latest activity. | Distinguish an actual vendor report from subsequent scheduling, hold or review activity. |
| Source of truth | `backend/src/contracts/vendor-execution.ts` and `backend/src/services/vendor-execution-projection.ts` expose `status`, `tracking`, `daily`, `flags`, `nextOwner`, `allowedActions`, `canSubmitToClient`, schedule and verification facts. | Present server decisions; do not create another workflow engine in the UI. |
| Review history | `vendor-execution.service.ts:history` returns paginated execution events. The existing vendor-work detail response also has Client review fields such as `requestedChangeReason`, `submittedAt` and `acceptedAt`. Execution history is not a complete Client review journal. | Do not invent review events, actor names, reasons or timestamps to fill a visual timeline. |
| Freshness | `ExecutionLiveProvider.tsx` invalidates execution and related queries on events, with reconnect/focus recovery and polling fallback. `ExecutionWorkspace.tsx` exposes connection state and Refresh. | Reuse and verify the existing refresh mechanism. No additional subscription service is needed. |
| Styling | `vendorWork.css`, `execution.css`, global tokens and shared UI controls define the current presentation. Execution components are also used by staff. At narrow widths the assignment table has a 680px minimum width. | Vendor-specific changes need explicit style boundaries and a usable mobile browser layout without changing staff screens. |
| Existing safeguards | `VendorWorkPage.test.tsx` covers reported progress versus verification, blocked reports, stale versions, dirty forms, evidence and authorized Client submission. Execution tests cover permissions, identity, notifications and refresh. | Preserve these behaviors and add focused coverage for the new presentation. |

## Recommended approach

Extend the existing vendor workspace with a vendor-specific workflow summary, clearer action guidance and a more legible update/review hierarchy. Reuse current queries, mutations, components and styling tokens.

Keep the existing desktop assignment structure recognizable. Add concise stage and next-step context to each assignment and put the selected assignment's workflow summary near the top of its existing detail panel. Use a compact, semantic sequence for acknowledgement, schedule, work reporting, Project Manager verification and Client review. Exceptions such as holds, rework, setup and supersession must be explicit rather than forced into a linear success path.

No independent vendor application, replacement design system or new workflow service is warranted by the current architecture.

## Styling and interaction requirements

1. Preserve the current application shell, typography, theme palette, control treatment, spacing rhythm and panel behavior. Use the actual current screen as the visual baseline during implementation.
2. Use established surfaces and restrained separators for the added workflow information. Do not introduce new fonts, icon packages, gradients, shadows, glass effects, decorative motion, rounded card grids or a generic dashboard redesign.
3. Scope vendor-specific presentation to vendor components or an explicit vendor variant. The detail panel is portaled, so it needs its own vendor variant rather than relying only on a page ancestor selector. Do not modify global styles to solve a local vendor layout issue.
4. Keep project name/number, room, Main Line and issued order/revision visible enough to distinguish similar assignments. Preserve stable assignment IDs for selection, keys, commands and notifications.
5. On mobile browsers, adapt the same assignment data into a readable vertical presentation or equivalent responsive rows. The core stage, deadline and action must be usable without horizontal table scrolling. Preserve desktop information and pagination.
6. Use semantic stage labels and visible text for waiting, blocked, overdue, accepted and superseded states. Color alone must not convey status. Keyboard access, focus visibility, panel focus management and touch targets remain required.
7. Retain loading, empty, filtered-empty, error and retry states. Use the existing loading treatment, without introducing skeleton loaders. Respect reduced-motion preferences; no new animation is necessary.

## Workflow presentation requirements

### Assignment list

- Show the current server-provided stage, vendor-reported percentage, daily reporting obligation and committed finish date with clear labels.
- Surface a concise next-step explanation and any hold/blocker or required setup affecting the assignment. Retain server flags and owner information without implying that a vendor can perform staff actions.
- Preserve server totals and counts. Do not label a count calculated from one loaded page as a portfolio total, or add action-count filters without matching backend support.
- Keep search, status/attention filters, Refresh, pagination and notification-selected detail opening functional.

### Assignment detail

Present the following hierarchy within the existing panel:

1. Assignment identity, current stage, next available vendor action and waiting-owner explanation.
2. Workflow stages with explicit current/waiting/accepted states. Mark a milestone complete only when supported by persisted facts. Reporting 100% never marks verification or Client acceptance complete.
3. Latest vendor report, clearly labeled with its timestamp, percentage, note, reason and blocker next action when available. Keep latest workflow activity separate.
4. The existing action form or a direct path to it, followed by relevant schedule, evidence and review context. Preserve the approved-order disclosure and activity history.

The stage summary is explanatory, not a set of controls for jumping between workflow states. Available commands must come from `allowedActions`; Client submission must come from `canSubmitToClient`. The returned `nextOwner` identifies a workflow handoff and must not hide a separately available vendor action.

| Backend state or condition | Vendor-facing guidance |
| --- | --- |
| Setup required | Explain that tracking must be enabled by the authorized owner. Do not offer vendor setup. |
| Awaiting acknowledgement | Acknowledge the issued work when permitted. |
| Awaiting schedule | Propose dates when permitted; distinguish a saved proposal from a confirmed commitment and explain that confirmation is pending. |
| Not started / in progress | Show the reporting obligation, latest saved report and daily-update action when permitted. |
| Blocked | Show the recorded blocker reason and next action. A blocker alone must not imply exemption from daily reporting. |
| On hold | Show the saved reason and review date. Follow backend reporting and action eligibility. |
| Reported 100% | Explain that completion submission and verification are still required. Preserve current-round evidence requirements. |
| Awaiting verification | Clearly state that Project Manager verification is pending. Vendor percentage is still self-reported. |
| Site verified | Show verification independently from Client acceptance. Offer Send to Client only when `canSubmitToClient` permits it; otherwise describe only the handoff supported by available data. |
| With Client | Show Client review as pending. Do not offer duplicate submission or editing that the backend has locked. |
| Changes requested | Surface the available saved reason and current execution round; explain the permitted rework action and need for fresh verification. |
| Client accepted | Show acceptance without implying that the entire project is closed or any payment has been released. |
| Superseded / existing legacy review | Preserve historical context, apply returned action restrictions and do not fabricate modern milestones for legacy assignments. |

### Updates and reviews

- Use `latestVendorReport` for the latest vendor report, including its execution-round identity. If absent, show that no current-round report is available; do not substitute a staff activity note.
- Use existing authorized vendor-work detail data when a Client change reason or acceptance/submission timestamp is needed and absent from the execution response. Fetch it only for the selected assignment, preserving stable IDs and separate version domains.
- Keep execution activity and Client review facts clearly identified. Do not synthesize a full audit timeline from status alone or label generic execution history as complete Client review history.
- Show only supplied actor information; omit opaque internal actor IDs from the vendor-facing activity presentation. Do not infer a person's name or role from an ID.
- Missing details remain explicitly unavailable. Failure to load review context must not appear as a successful review, or suppress independently available assignment data.

## Data, authorization and state invariants

- Backend statuses, permissions, deadlines, daily flags and counts remain authoritative. The presentation maps them to readable copy; it does not calculate new business states, lateness rules or completion eligibility.
- No API schema, persistence, route authorization, email, invitation, approval or financial calculation change is planned. If investigation demonstrates a backend inconsistency that prevents correct presentation, document it and revise this specification before expanding scope.
- Preserve expected-version/CAS checks, idempotency, current-round evidence, immutable review history and close-with-unsaved-changes protection.
- An action response updates the detail with authoritative returned data and refreshes every affected execution/vendor-work/review query. Failed writes preserve the form and do not advance the displayed stage.
- Cross-session workflow changes must refresh the visible list and detail through the existing live provider or its polling fallback. Show offline/stale/refresh-failed states accurately; access denial clears protected content.
- New summaries and actions must not bypass existing stale-data protection. Disable a newly added mutation entry point when its authoritative data has failed to refresh or permission is unavailable.
- Preserve issued order scope, amounts, revisions and original deadlines. No shared Configuration or purchase-order changes are included.

## Assumptions, non-goals and open decisions

- The delivery target is the React web vendor portal at `/vendor`, including desktop and mobile browsers. Native `mobile/` application changes are not included in this specification.
- Existing styling is the reference; no replacement visual reference or new branding was supplied.
- Procurement directory/details, staff execution redesign, Client review-page redesign, onboarding/login authentication and public vendor forms are outside scope.
- No new dashboard analytics, notifications, external messages, dependencies, database migrations, backfills or production actions are required.
- No unresolved architectural choice is needed to proceed with this specification. A requested native-app expansion or backend workflow change would require an explicit specification revision.

## Risks and mitigation

- **Shared component regressions:** use explicit vendor variants and include staff execution checks when touching shared components.
- **Misleading linear progress:** cover setup, legacy, blocked, hold, rework and superseded states; preserve distinct vendor, Project Manager and Client facts.
- **Partial review information:** show only supported details from existing authorized endpoints; never invent a decision event or timestamp.
- **Changing action availability:** retain backend guards, stale-version review and draft preservation when another session updates the assignment.
- **Style drift or mobile density:** compare rendered before/after views and verify long names, missing data, waiting states and active forms across widths.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification evidence required during implementation |
| --- | --- | --- |
| AC1 | Vendor list and detail retain the established visual language with no global or staff-screen styling regression. | Before/after rendered comparison of vendor list, detail and one shared staff execution screen. |
| AC2 | Current stage, permitted next action and waiting context are understandable for every state listed above. | Focused rendered tests using backend-shaped fixtures, including setup, legacy, hold and rework. |
| AC3 | Latest vendor report remains distinguishable from a newer staff activity note; review facts are never inferred. | Tests with different report/activity text and timestamps, missing report data and available/missing Client review context. |
| AC4 | A 100% report, verified completion and Client acceptance remain distinct; only authorized transitions are available. | Existing vendor workflow regressions plus transition-specific presentation assertions. |
| AC5 | Saved and cross-session updates refresh the visible workflow correctly; conflicts preserve drafts and stale/offline/denied states remain clear. | Mutation, live-invalidation/polling, failed-refresh, 409-conflict and permission-denial tests. |
| AC6 | Identically named assignments from two different projects/orders remain distinct throughout list selection, updates and review display. | Asymmetric project/order fixtures and command/query identity assertions. |
| AC7 | Vendor workflows are usable at 390px, 768px and 1440px widths, with keyboard navigation and readable status text. | Browser checks of list, detail, daily report, waiting review, empty/error states and panel focus behavior. |
| AC8 | Type safety, existing functionality and repository hygiene are preserved. | Focused vendor/execution tests, frontend typecheck, test suite and production build, followed by `git diff --check` and `git status --short`. There is no repository lint script. |

No tests or visual checks are claimed complete at the specification stage. Temporary verification artifacts must remain ignored and be reported during the final implementation handoff.

## Compatibility and rollback

The intended change is a backward-compatible presentation enhancement using existing contracts. There is no data migration or external side effect. Rollback consists of reverting only the eventual vendor presentation changes while retaining all saved workflow events, reports, evidence and approvals.

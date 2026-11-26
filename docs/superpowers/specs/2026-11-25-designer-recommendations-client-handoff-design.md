# Designer recommendations, accepted assignments, and client handoff

Date: 2026-11-25

Status: Implemented in approved Mode A and verified locally on 2026-11-25. See the task plan execution record for checks, compatibility fixes, and the unrelated pre-existing API-documentation test failure.

## Goal

Help Super Admin choose a Designer using current workload, language, and location information. Require the chosen Designer to accept the assignment request before activating the existing design workflow. After initial estimate approval, simplify the Client project screen into Estimation, Design flow, and Execution expansion panels, and let the Client confirm a key-collection deadline or choose a future date/time.

## Confirmed user decisions

1. Location recommendations use saved city/area text, not coordinates or calculated distance.
2. The 48-hour key-collection countdown starts when the Client confirms that option.
3. Actual key collection remains after **both Internal Kickoff and Client Kickoff**. Those prerequisites must not be bypassed.

Consequence: a Client may confirm the 48-hour window before kickoffs finish. The confirmed deadline still runs, while the UI shows incomplete kickoffs as prerequisites. It must not silently delay the countdown, extend the deadline, or claim collection is permitted. Both kickoffs need to be completed within the confirmed window for on-time collection.

## Current behavior and evidence

- `frontend/src/features/admin/SuperAdminProjectDetails.tsx` already has Assignments → Designer through `ProjectPeopleAssignments` and `DesignAssignmentPanel.tsx`. The current panel uses an active-Designer dropdown and assigns immediately.
- `GET /admin/designers` returns only ID, name, and email. `POST /admin/projects/:projectId/design-assignment` calls `project-workflow.service.ts::assignDesigner`, immediately updating the approved estimate, project team, lead next action, workflow task, and audit in a Mongo transaction. There is no post-estimate assignment acceptance state.
- `DesignerDesignPlanTasksPage.tsx` shows assigned work. Estimate-review assignment/decision operations are a separate pre-approval workflow and must not be reused as post-approval assignment acceptance.
- The completed User Location and Language features provide `User.location`, `languagesKnown`, and `preferredLanguage`. Location is free text; there are no user/project map coordinates. These features are uncommitted and must be preserved.
- Project location/city are on `Project`; project persona language comes from the correctly linked Lead via `repositories/admin-project-summary.ts`. `domain/procurement-city.ts` treats a confirmed city as separate authority and deliberately does not parse an address into one.
- Project statuses are `planning`, `active`, `on_hold`, and `completed`. Current membership is represented by assigned/primary/secondary Designer IDs. Historical initiating Designer identity must not be mistaken for a current assignment.
- `ClientProject.tsx` currently renders estimation, the workflow, site/vendor review, floors, design review, and approved documents as separate page sections, rather than the requested three parent panels.
- `domain/design-workflow-state.ts` requires Internal Kickoff and Client Kickoff before Key Collection. Site Measurement additionally requires both key handover confirmations. `design-workflow-state.service.ts` records separate Client `keys_handed_over` and Designer `keys_received` actions.
- Key Collection has no dedicated 48-hour client-confirmed deadline today. Other stage clocks are server-derived, and some pause with site-access blocks. Existing workflow actions use version checks, idempotency, immutable history, and authenticated actor capabilities.
- Shared quotation workflow v3 distinguishes initial Client approval from approval of a later Designer-revised quotation. Existing source validation and action gates must remain authoritative.

## Scope and assumptions

- This covers Super Admin's primary design-plan assignment, the receiving Designer's request queue, and the linked Client's project page. Secondary Designer/team assignment remains the existing workflow.
- “Every item as a separate expansion panel” means the three areas listed by the user: Estimation, Design flow, Execution. It does not change each quotation line into another panel.
- The “Designer will be assigned soon” message belongs in the Client's Design flow panel after initial estimate approval. A proposed Designer sees their own request, not an unassigned project's full workspace.
- One selected Designer receives a request at a time per project. All eligible Designers remain browsable; this is not a broadcast to all Designers.
- Recommendation order follows the user's criteria: lower active-project count first, then language match, then location match. All factors and missing values are visible, so Super Admin can choose any eligible Designer.
- Alternative scheduling asks for a future **date and time**, displayed explicitly in Asia/Kolkata and stored as UTC. This avoids inventing an unspecified time of day.
- Client confirmation of either option is final for this initial scheduling step; there is no extra Designer approval of the Client's chosen date. Later rescheduling is outside this request.

## Super Admin: Designer suggestions

Under Assignments → Designer, show a concise ranked list of Designer suggestion cards with:

- Designer name and current assignment eligibility.
- **Projects handling:** distinct currently assigned projects whose status is not `completed`, including on-hold projects. Count each project once across primary/secondary/assigned memberships. Do not count historical initiation alone or pending requests as accepted workload.
- Designer preferred language and known languages; an explicit match explanation against the project's persona preferred language.
- Saved Designer location and **Same area/location**, **City text match**, **No location match**, or **Location not provided**.
- **Send assignment request**, plus the current request state where applicable.

Recommendation rules are calculated on the backend:

1. Sort by active-project count ascending.
2. Break ties by preferred-language match, then known-language match, then no match/unknown. Missing project preference is shown as unavailable and does not fabricate a match. Use the linked project's persona preference; do not silently replace it with another user's preference.
3. Break remaining ties by normalized full-location match, then confirmed-project-city text match, then no match/unknown. Normalize Unicode/case/whitespace conservatively. A city text match requires the full Designer location or an explicit comma-separated component to equal the confirmed project city. Never infer kilometres, ambiguous city aliases, or change stored city identity from address parsing.
4. Break equal results consistently by normalized name and stable Designer ID.

Return source values and match reasons with a server timestamp. No opaque fit percentage, invented capacity limit, or KPI score. Missing language/location does not exclude an otherwise eligible active Designer. Avoid N+1 per-Designer project queries; aggregate current assignments and provide bounded pagination/search so all active Designers can be reached.

Use compact vertically arranged cards/list entries that adapt to mobile. Preserve the existing Procurement and Project Manager dropdown assignment screens. No new visual library or icon dependency is needed.

## Assignment request lifecycle

```text
Eligible approved project → pending request → Designer accepts → active assignment
                                          → Designer declines → available for another request
                         → Super Admin cancels → available for another request
```

- Persist a request with stable IDs for project, approved estimate/approval source, proposing Super Admin, target Designer, previous assignment, status, version, idempotency key, and creation/decision timestamps. Retain decided/cancelled requests as history.
- Enforce at most one pending primary-assignment request per project through transactional checks and an appropriate unique constraint.
- Creating a request does not grant project access, add chat membership, assign tasks, replace the current Designer, or change any approved amount/artifact.
- Show pending requests in the existing Designer design-work area, with a safe preview (project name, location, language preference, and approved-scope summary) and **Accept assignment** / **Decline**. Only the target active Designer can decide. An optional decline note is visible to Super Admin, not to the Client.
- This dedicated request preview is narrowly authorized. It must not grant access to project documents, chat, client contact details, or other project endpoints before acceptance.
- On acceptance, revalidate active identities, project/estimate lineage, current assignment, source approval, and existing design-assignment eligibility inside one transaction. Then invoke the existing assignment effects through a shared internal transaction helper, without impersonating a Super Admin or recursively opening a second transaction.
- The request decision, team/estimate/lead updates, deterministic task upsert, and audit must commit together. Replaying the same acceptance must not duplicate a task, reset a deadline, or emit another semantic decision.
- A declined/cancelled request creates no assignment. Super Admin can send a new request afterwards. Do not automatically expire unanswered requests or assign the next candidate.
- On reassignment, retain the existing Designer and access until the replacement accepts. Recheck the assignment source at acceptance. Preserve existing approved-design reassignment restrictions and the existing primary/secondary team update rules.
- A confirmed key-collection appointment belongs to the project and must not reset on reassignment. Its outstanding Designer action moves to the newly accepted primary Designer. Already completed handover history is preserved.
- If a Designer becomes inactive, an approval source becomes invalid, or the project becomes ineligible while a request is pending, acceptance fails safely with an actionable conflict. Super Admin can cancel and choose again.
- The existing immediate-assignment endpoint must not remain a bypass for new requests in this flow. Retain it only as an explicit compatibility response directing old callers to the request flow; never silently perform an immediate assignment. Preserve historical assignments without fabricating acceptance events.

In-app request/status surfaces are sufficient for this scope. Do not send new external emails or extend the chat-only notification system to unauthorized pending project members.

## Client project layout and messaging

After initial Client estimate approval, render three independently expandable parent sections. Use authoritative approval history, not a hardcoded status label; a later quotation revision must not erase the established layout or hide existing history.

1. **Estimation:** existing quotation details, selected items, PDF, current review/revision actions, and approved history. Show the existing all-inclusive money presentation; do not reintroduce separate GST/round-off rows or progress percentages.
2. **Design flow:** assigned Designer/handoff status, key-collection scheduling, existing kickoff and design stages/actions, design review, floors where relevant, and approved design documents.
3. **Execution:** existing site-completion and vendor-work review/actions. Before execution eligibility, show a clear waiting state rather than functioning execution controls.

Default to Design flow expanded after initial estimate approval; Estimation and Execution collapsed. When execution becomes active, it may become the initial expanded section on first load. Do not force a user's manually chosen open/closed state on refresh, discard in-progress forms when a panel closes, or accidentally route existing workflow portals/actions outside their parent panel. Before initial approval, keep the existing estimation entry experience.

Design messages:

- Approved, no accepted Designer: **“Your estimate is approved. We’ll assign your designer soon.”** A pending internal request must not be described as an accepted assignment.
- Accepted: **“Your designer, <name>, is assigned. Please confirm key collection within 48 hours or choose a date and time that works for you.”** Use the active accepted Designer's name only.
- Awaiting Client scheduling: clearly state that the countdown has not started.
- Confirmed: show the chosen deadline and any pending kickoff prerequisites. Keep messages accurate when collection is received/completed, or when assignment/source data is unavailable.

The Client must not see staff workload counts, other candidates, private user locations/languages, or internal decline notes. Preserve project status/owner chips and the prior removal of project progress percentages.

## Client scheduling and Designer countdown

- Offer two clear Client choices after Designer acceptance: **Confirm 48-hour window** or **Choose date and time** followed by **Confirm date**.
- Confirmation requires the authenticated linked Client. Do not introduce Super Admin “accept on behalf” shortcuts or broaden existing proof-backed representative permissions.
- Store an appointment in the project's design-workflow state with mode (`within_48_hours` / `chosen_datetime`), confirmed-by ID, confirmed-at time, original deadline, current deadline, and provenance pointing to the accepted assignment/source. Reuse workflow CAS, idempotency, audit, and immutable event history.
- For the 48-hour option, the server calculates `deadline = confirmedAt + 48 calendar hours`. Opening a page, sending a request, Designer acceptance, or browser refresh must not start or restart the clock.
- For a chosen date/time, the server validates it is in the future and stores that precise instant as the deadline. The countdown runs toward that date instead of adding another 48 hours.
- Schedule confirmation is allowed before kickoff completion, but **actual key handover/receipt actions still require both kickoffs** and the existing approval/action eligibility. Scheduling is not evidence that keys were handed over.
- Show the Designer a server-backed countdown and the absolute deadline in the project/design task surface, including before the Key Collection stage becomes actionable. Show pending kickoff prerequisites alongside it so the countdown is not hidden behind a different current stage.
- Use server time plus client elapsed time for display, recover correctly after reload/refetch, and show overdue state after zero. Do not rely on the device clock for authoritative scheduling.
- This is a fixed Client appointment, separate from existing pausable performance/SLA clocks. Site-access or kickoff blockers do not silently extend the confirmed deadline or change KPI rules. Clearly distinguish the appointment countdown from existing paused-stage messages.
- The Designer's collection countdown ends when the authorized Designer confirms keys received. The Key Collection stage still completes only after both the Client handover and Designer receipt are recorded. Expiry alone does not complete anything.
- First confirmation establishes the original deadline. Duplicate/conflicting submissions must not overwrite it. No general deadline-reset or rescheduling API is included in this slice.
- Existing key-completion history remains valid. Existing accepted assignments need no invented request/acceptance; they may offer scheduling for unfinished collection, but historical workflow actions are not retroactively invalidated solely because an old appointment record is absent.

## Contracts, authorization, and state ownership

New narrow HTTP resources are recommended, with final schemas defined in the approved implementation plan:

| Surface | Contract intent | Authorized actor |
| --- | --- | --- |
| Project Designer suggestions | Project-scoped ranked candidates, workload counts, match reasons, pagination, current pending request | Super Admin with project assignment permission |
| Assignment request create/list/cancel | Stable request ID, expected source/version, idempotency; read decided history | Super Admin within project scope |
| Own incoming assignment requests | Safe pending-preview DTOs only | Target active Designer |
| Assignment request decision | Request ID/version, accept/decline, optional decline note, idempotency | Target active Designer only |
| Client handoff summary | Accepted Designer name, pending/accepted state, appointment status and safe timestamps | Linked Client; accepted project team and authorized oversight get role-appropriate views |
| Key appointment confirmation | Existing workflow action envelope plus choice/date payload, CAS and idempotency | Linked Client only |

Synchronize protected routes with the canonical route-operation authorization registry and OpenAPI. Super Admin request administration must not authorize the Designer's personal acceptance or Client's personal scheduling decision.

Keep the existing direct-Mongoose assignment service boundary; a focused request model/service and extracted internal assignment transaction helper are preferable to a broad repository rewrite. Extend repository-backed workflow scheduling contracts in **both memory and Mongo**. Data is additive; no backfill or historical approval rewrite is required.

Invalidate/update relevant admin project/suggestions, Designer requests/tasks/projects/team, Client project/quotation/workflow, and project status/owner queries after transitions. Query keys must include project and actor/scope where relevant; suggestions cannot remain in the old global cache key when ranking becomes project-specific. Use bounded refetching for other sessions, with retry/error states and stale submissions checked by the backend.

Update project status/owner projections so a pending request belongs to the requested Designer's decision, an awaiting schedule belongs to the Client, and key receipt belongs to the accepted Designer. Preserve genuine kickoff actions and their blockers; do not replace existing phase names with invented “Planning” or percentage values.

## Invariants, failure handling, and compatibility

- Approved estimates, review records, prices, PDFs, design approvals, and existing downstream task history remain immutable.
- Actor identity, project linkage, current approval, assignment ownership, CAS, and idempotency are checked inside mutations, not trusted from displayed cards.
- Two simultaneous requests/acceptances/cancellations must yield one coherent outcome with no double assignment, lost previous team, duplicate task, or partial audit. Transactional failures roll back all new state.
- Errors preserve form choices when retry is safe; source/version conflicts refresh and require review. Do not silently assign a fallback Designer or choose a date for the Client.
- Missing preference/location appears as missing, not a false recommendation. Source ambiguity blocks project-specific matching/assignment rather than joining on names or guessing a Lead.
- Legacy assignments remain assigned. Completed key stages retain their original timestamps. Historical requests/appointments must remain readable if UI code is rolled back; rollback must not delete history or re-enable a bypass around pending acceptance accidentally.
- No external geocoder, paid mapping service, coordinates, workload capacity percentage, automatic assignment, calendar integration, broad notifications redesign, quotation pricing change, or general rescheduling workflow is included.
- No new dependencies are expected. No commit, push, deployment, live index migration/backfill, seed, real email, or production mutation is authorized by this specification.

## Acceptance criteria and verification

1. Super Admin can browse all eligible Designers under Assignments → Designer and see accurate backend-derived distinct-project counts, language/location match explanations, and deterministic ordering. Include tests with unequal workloads, multiple membership fields on one project, completed/on-hold projects, missing metadata, and two different project language/location contexts.
2. Sending a request creates pending state only. The target Designer can accept/decline from their own queue; unauthorized actors and unrelated Designers cannot inspect/decide it. Acceptance activates exactly the existing eligible assignment effects and tasks, with no pre-accept project/chat entitlement.
3. Duplicate/concurrent request, accept, cancel, source-change, and reassignment cases preserve one coherent assignment and immutable history. Test rollback and transactional Mongo races. Legacy accepted assignments continue to work.
4. After initial estimate approval, the Client has Estimation, Design flow, and Execution expansion panels with accurate empty/waiting/active/completed states. Existing estimate PDF/review, design actions/documents, execution reviews, status chips, and inclusive totals remain accessible. Closing panels preserves unsaved inputs and keyboard/focus behavior; no progress percentages return.
5. Before acceptance, the Client sees the awaiting-Designer message. After acceptance, they see the correct name and scheduling choices, with no staff recommendation metadata leakage.
6. Client confirmation starts exactly one 48-hour deadline, or stores the Client's chosen future instant. Invalid/past dates, wrong Client, source/version conflicts, and repeated clicks cannot reset or forge the schedule. Test timezone conversion and server-authoritative time using a controlled clock.
7. The Designer sees a countdown/deadline after Client confirmation, including while kickoffs are pending. Both kickoffs remain required for key actions. Receipt stops the Designer timer; both confirmations remain required for stage completion. Test before confirmation, custom date, refresh, expiry, blockers, reassignment, and historical completed stages.
8. Permission/route/OpenAPI inventories and memory/Mongo workflow contracts stay aligned. Verify asymmetric identities/projects, approval lineage, private projections, idempotency/audit, and unaffected subsequent design/execution gates.
9. Focused backend/frontend regressions, replica-set integration, both typechecks/builds, and rendered desktop/mobile/keyboard/accessibility checks pass. Audit current-source regressions before deciding wider suites. Repository hygiene must preserve the uncommitted Location/Language work and exclude runtime artifacts. Report exact evidence, unrun checks, and any existing unrelated failures.

## Remaining decisions

None require another clarification before spec review. The confirmed geography, timer-start, and kickoff choices above govern implementation. Other bounded defaults (one pending request, displayed ranking order, independent panels, and initial date/time confirmation) are explicit assumptions for this approval.

The repository requires specification approval, then a separate task plan and execution-mode selection before implementation.

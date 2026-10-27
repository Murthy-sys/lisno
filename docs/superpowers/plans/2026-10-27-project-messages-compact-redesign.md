# Compact shared Project Messages implementation plan

Date: 2026-10-27
Status: Approved by the user on 2026-10-27. Mode A selected. T0–T6 complete. T7 checks executed; scoped validation passes, while the repository-wide suite remains non-green for failures outside messaging.

Approved specification: [Compact shared Project Messages redesign](../specs/2026-10-27-project-messages-compact-redesign-design.md). The user approved this specification in chat on 2026-10-27; that approval supersedes its authoring-time status line.

## Outcome and fixed constraints

Deliver the shared compact web messaging layout from the approved specification for every role with existing messaging access. Preserve Actions, tags, priorities, mentions, replies, emoji, attachments, voice, Lisno AI, participant administration, project status, draft restoration, chat hours, and all existing mutation behavior.

Use the existing backend contracts. No backend/native-mobile changes, permissions expansion, dependencies, migrations, production actions, commits, pushes, or deployment are included. The plan changes presentation and exposes already-supported conversation-list reads.

The separate execution-mode gate follows task-plan approval. No subagents start before Mode A is selected. In Mode B, the primary agent performs every task, review, and verification inline.

## Dependency order and ownership

Keep one parent task in progress. After foundations are settled, the independent list and details tasks may run alongside primary-owned conversation presentation work.

| Task | Deliverable | Depends on | Owner in Mode A | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0 | Current baseline, protected diffs, and feature inventory | Execution-mode selection | Primary | AC1, AC3, AC4, AC10 |
| T1 | Frontend list contracts, media access adapter, and presentation foundations | T0 | Primary | AC2, AC5, AC6, AC8 |
| T2 | Compact searchable/filterable conversation list | T1 | Frontend implementer, list scope | AC2, AC5, AC7, AC9 |
| T3 | Compact authorized project details content | T1 | Frontend implementer, details scope | AC3, AC6, AC8, AC9 |
| T4 | Shared shell and compact conversation/composer presentation | T1 | Primary | AC1, AC2, AC3, AC4, AC7, AC9 |
| T5 | Integration, cross-surface regressions, and synthetic QA fixtures | T2, T3, T4 | Primary | AC1–AC9 |
| T6 | Integrated integrity review and necessary fixes | T5; all writers finished | Integrity reviewer, then owning writer for fixes | AC3–AC10 |
| T7 | Final verification, visual QA, and handoff | T6 and any resulting fixes | Verification runner with primary visual reconciliation | AC1–AC10 |

### File ownership boundaries

All paths below are relative to the repository root. Assign ownership before writing, and tell every implementation agent that it shares the worktree and must preserve other contributors' edits.

| Owner | Exclusive write scope |
| --- | --- |
| Primary | `frontend/src/components/layout/AppShell.tsx`, narrowly scoped messaging selectors in `common-shell.css`; `frontend/src/features/messages/ProjectChatLayout.tsx`, `ProjectMessagesListPage.tsx`, `ProjectMessagesPage.tsx`, `projectChatShell.css`, `projectChat.css`, `ChatTimeline.tsx`, `ChatComposer.tsx`, `ChatActionMenu.tsx`, `ChatFileTray.tsx`, and necessary messaging-only presentation styles; `projectChatTypes.ts`, `projectChatApi.ts`, `projectChatFixtures.ts`, `ChatMessageAttachments.tsx` and their tests; shared layout/page/provider regression tests; synthetic QA fixture integration; plan/spec reconciliation after implementation authorization. |
| List implementer | `frontend/src/features/messages/ProjectConversationList.tsx`, `ProjectConversationList.test.tsx`, and new `projectConversationList.css`. No writes to shared shell styles, API/types, provider, or shared fixtures. |
| Details implementer | New `frontend/src/features/messages/ChatProjectDetails.tsx`, `ChatProjectDetails.test.tsx`, and `chatProjectDetails.css`. No writes to the route page, provider, status feature, participant administration, or media implementation. |
| Integrity reviewer | Read-only integrated diff and relevant contract inspection. No source edits. |
| Verification runner | Test/build/browser execution and temporary reports only. No product-source changes. |

Any extra file needed is reassigned explicitly by the primary before editing. The primary owns shared contracts and integration. Child requests for a shared change are returned to the primary, not independently patched. No concurrent writers touch the same path.

## T0: Establish the current baseline

1. Capture `git status --short` and the current diff for every intended dirty target before writers start. The existing Project Manager changes in `AppShell.tsx`, `common-shell.css`, and `ProjectMessagesPage.tsx` must remain intact, including notifications and `draft=project-update` handling.
2. Reconfirm current list/search/preview and status contracts against source; do not modify backend contracts to make frontend tests convenient.
3. Record the preserved control inventory from the current page, composer, timeline, participant dialogs, and AI controls. Map each to its current handler/capability and its redesigned location.
4. Run the focused messaging/status suites as a baseline. Record any existing failures with exact commands and distinguish them from later regressions. Capture a synthetic rendered baseline where the local QA harness supports it.
5. Establish file ownership and keep baseline reports in a task-specific temporary directory outside tracked source.

Exit condition: scope and prior work are understood, with a control inventory and reproducible baseline. No baseline failures are hidden by deleting tests or weakening assertions.

## T1: Prepare contracts and shared presentation foundations

1. Align frontend list types with the existing backend `ChatConversationFilter`, last-message preview, attachment summary, and aggregate totals. Preserve their units: unread conversations versus critical/important open issues.
2. Extend `projectChatApi.conversations` to accept supported search/filter parameters and an abort signal. Keep all variants below `chatKeys.list(scope)`. Preserve the existing offset/signal call shape where practical to avoid unnecessary unrelated consumer changes.
3. Add realistic synthetic conversation-page fixtures with previews/totals and update primary-owned contract fixtures. Do not make actual contract fields optional solely to accommodate old mocks; handle genuinely missing runtime data without invented counts.
4. Define messaging-scoped surface, border, type, spacing, and control tokens. Settle shared class boundaries before parallel writers start. Move list-specific styling from `projectChatShell.css` into the list-owned stylesheet once, so later changes have one owner.
5. Provide a small feature-local SVG icon helper if useful for multiple redesigned controls. Preserve accessible names; add no library or global icon-system rewrite.
6. Expose a minimal action adapter from the existing `ChatMediaProvider` context for compact attachment rows. Reuse its authenticated `open(attachment, download?)` path, transfer limits, abort logic, current-identity guards, and object-URL cleanup. Do not create another media provider or download implementation.
7. Agree the details component inputs before dispatch: project summary, participant query state/data, loaded committed messages, history completeness/filter context, valid overview destination, visibility, and callbacks for participant management and source-message navigation. Project status may use the existing status API with permission/visibility guards; it does not control chat authorization.

Verification: API parameter encoding and cancellation tests; types/fixtures agree with current backend fields; media access remains inside the existing provider. Shared exports and CSS boundaries are ready before T2/T3 begin.

## T2: Implement the conversation list

1. Apply the compact `Project messages` header, refresh/navigation controls, project search, and All/Unread/Critical/Important filters.
2. Debounce project-name search, respect the server's input limit, reset offset when search/filter changes, and cancel superseded requests. Include session, filter, search, and offset in query identity.
3. Render real last-message/attachment previews alongside participant count, status, dates, unread mentions, unread-message count, and critical count. Keep selection accessible and avoid a colored left stripe.
4. Label aggregate badge units accurately. Omit an All badge without an authoritative unfiltered total. Preserve server pagination and filter the full authorized set through the existing endpoint.
5. Retain visible-document scheduling, mobile-hidden suspension, focus/reconnect refresh, manual refresh, scroll preservation, and stale/error states. Avoid N+1 summary/history calls.
6. Provide distinct no-conversations, no-matches, filtered-empty, unavailable, and loading states with compact sizing and keyboard-operable controls.

Verification: list tests cover 31+ conversations, unequal unread/critical/important totals, results on later pages, empty search, cancellation races, session/query changes, stale results, denied projects, keyboard selection, and existing hidden/visible request scheduling. Run `cd frontend && npm test -- src/features/messages/ProjectConversationList.test.tsx` after the slice stabilizes.

## T3: Implement project details content

1. Build compact, flat sections for canonical project identity, workflow status/next action, participants, and `Files in this view` using the settled props.
2. Show a valid existing overview link only when available. Use initials and real statuses; omit unsupported imagery/location, progress percentage, pinned updates, favorites, and presence dots.
3. Reuse the existing project-status API/query identity. Fetch only with appropriate permission, confirmed conversation context, and visible details. Reuse cached data, expose retry/stale states, avoid hidden polling, and discard data on loss of access/identity changes. A status-only denial must not revoke valid chat access.
4. Render participant preview rows and an explicit route to the existing full participants/management presentation. Do not duplicate its mutation dialogs or reason/version state. Parent-owned integration keeps one stateful participant administration component mounted at a time.
5. Derive file rows from the current successfully loaded committed history, keyed by stable message/attachment identity. Exclude unsent drafts and upload attempts. Reuse the media adapter for downloads/available previews and the source-message callback for context.
6. Label bounded history truthfully. The current message query keeps at most six pages; loading older history can evict newer pages. Recompute the file subset from the actual retained view instead of retaining an unbounded archive. Explain filtered, contextual, incomplete, and stale-history coverage.
7. Do not auto-fetch original files or bulk-load old history for the details rail. File transfer begins from the relevant user action.

Verification: isolated details tests cover missing overview/status permission, status loading/error/denial, absent metadata, participant capabilities, file-only messages, duplicate filenames with different IDs, filtered/partial/window-evicted history, source navigation, and no background file transfer. Run `cd frontend && npm test -- src/features/messages/ChatProjectDetails.test.tsx` after the slice stabilizes.

## T4: Implement the shared shell and conversation presentation

1. Restore the existing permission-filtered application navigation in the desktop messaging shell. Scope changes to messaging so role dashboards remain unchanged. Retain account/logout, notifications, Project Manager notifications, and daily critical tasks.
2. Implement the approved dimensions: compact navigation and conversation list, flexible central conversation, and details rail around 1440px+. Below that, provide the details drawer; below 1024px, retain list/conversation navigation and the navigation drawer.
3. Preserve the provider and list lifecycle. Do not place breakpoint keys around the conversation/provider or recreate drafts/streams when details open or the viewport changes.
4. Refine header, history, date/unread separators, own/grouped messages, attachment sizing, pending/error messages, and empty screen. Remove patterned backgrounds, shadows, oversized headings, excessive radii, and ornamental elements within the messaging surface.
5. Compact the existing composer without changing business handlers. Keep labelled Actions visible; retain importance, emoji, attachment formats, voice recording, mention behavior, selected-action tags, reply state, file tray, due-date/responsibility information, and all validation/recovery controls.
6. Preserve in-message action tags, issue-history access, contextual navigation, filters, AI controls/results, status fallback behavior, and rename/participant permissions. Replace only presentation-level icon usage where required by the approved design.
7. Keep 44px coarse-pointer targets, visible keyboard focus, mobile textarea usability, reduced motion, safe areas, and scroll regions that leave history accessible above the composer.

Verification: run focused composer, timeline, media, layout, and page tests for the affected markup. Keep semantic feature assertions; update assertions that intentionally encoded the old title or absence of a desktop sidebar. Do not delete coverage merely because layout changed.

## T5: Integrate and prove feature parity

1. Integrate details and conversation beneath one `ChatMediaProvider`, preserving its project/session key. Render either the details rail or details drawer, with correct landmarks and no duplicate accessible controls.
2. Retain the existing full participants component and dialogs. From narrow-screen details, transition to the participants panel with deliberate focus restoration; keep participant mutation state separate from the passive details preview so resizing does not lose a reason draft.
3. Keep details visibility, participant panel state, list filters, history filters, source-message selection, and composer state independent. `View in conversation` and source-file navigation must preserve draft data and valid query parameters.
4. Verify incoming events invalidate all list variants through the existing prefix, status data refreshes through established invalidation, and revoked access clears details/files/media as well as the conversation. The provider is normally unchanged; if wiring exposes a gap, make the smallest primary-owned correction with a regression test.
5. Update only necessary synthetic QA integration. Prefer a new `frontend/src/test/fixtures/enterpriseMessagesData.ts` module plus a small primary-owned hook into the existing dirty `enterpriseTransport.ts`; preserve its unrelated scenarios.
6. Cover writable and read-only chat hours independently with synthetic time/state. Use two unequal projects, a Client, an internal member/manager, a restricted member, and an excluded identity. Include long names, messages, filenames, action tags, replies, audio, images, file-only messages, and AI content.
7. Add only meaningful integration regressions for changed flows. Preserve existing tests for exact retry keys/payloads, revoked drafts, late responses, typing, and stream release. Avoid tests that merely mirror CSS declarations.

Verification: the feature inventory is fully reconciled. No Actions/tag behavior is removed, simplified, or made unreachable on mobile. All writers finish before final integrity review and full verification begin.

## T6: Review the integrated result

In Mode A, run `integrity_reviewer` read-only after T5. In Mode B, the primary performs the equivalent review inline.

Review query/filter isolation, authoritative count units, role/capability gates, status-only versus conversation denial, source-message/file lineage, draft and participant-state preservation, media access cleanup, event invalidation, accessibility/focus, hidden polling, and shared-shell regression risk. Compare the final task-owned diff against the captured baseline.

The primary reconciles findings and assigns fixes to the original owner. After any fix, repeat the affected checks before T7. Do not silently expand into backend behavior or unrelated work; a material change to the approved scope requires the repository's affected-artifact approval process.

## T7: Final verification and handoff

In Mode A, run `verification_runner` after all writers and review fixes finish. In Mode B, run the same checks inline. Run focused checks first, then the required integrated checks once the implementation is stable.

| Evidence | Commands or scenarios | Criteria |
| --- | --- | --- |
| Messaging/status regression suites | `cd frontend && npm test -- src/features/messages src/features/project-status` | AC3–AC9 |
| Shared shell/routes/accessibility | `cd frontend && npm test -- src/app/router.test.tsx src/components/layout/navigation.test.tsx src/test/accessibility.test.tsx` | AC1, AC2, AC8, AC9 |
| Frontend integration | `cd frontend && npm run typecheck && npm test && npm run build` | AC10 |
| Layout/visual matrix | 1920, 1440, 1280, 1024, 768, 390, and 320px; 200% zoom; wide and narrow writable/read-only states | AC2, AC3, AC9 |
| Rendered interactions | Search/filter/paginate; change project with a draft; resize; open details/participants; Actions and due-date workflow; mention/reply; emoji/media/audio controls; issue history; AI; status; keyboard menus and Escape/focus return | AC1–AC9 |
| Failure/access matrix | Initial/stale failures, empty results, unavailable policy/participants/status, reconnect, removed access, replaced identity, delayed response | AC5–AC9 |
| Runtime/resource checks | Browser console/network inspection; no overflow or clipped menus; one active project stream; no list-row history calls; no hidden details polling or unsolicited file downloads | AC7–AC9 |
| Repository hygiene | `git diff --check` and `git status --short`; compare task-owned hunks to baseline | AC10 |

Use a browser controller available in the session and inspect actual screenshots, not just DOM assertions. Treat automated accessibility checks as supporting evidence rather than a complete conformance claim. Do not install packages solely to obtain a preferred browser tool when an available controller can perform the checks.

Record exact commands/results, synthetic scenarios, any pre-existing failures, and remaining blind spots. Resolve new failures and rerun only the checks affected by fixes before final handoff. There is no lint script; do not claim lint passed. Backend, OCR, and native-mobile checks are not required for this frontend-only change unless the approved scope later changes.

Temporary screenshots/reports and generated build/cache outputs are not deliverables. Keep them ignored or in the task temporary directory, report their locations, and remove task-created disposable outputs when no longer needed without deleting pre-existing artifacts.

Final handoff must state the resulting UI, preserved features, principal file changes, exact successful/failed/unrun checks, remaining limitations, and that no migration, deployment, commit, push, or external communication was performed. Do not call partially verified work complete.

## Approval state

- Specification: approved by the user on 2026-10-27.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- T0–T6: implemented, integrated, and independently reviewed.
- T7: required checks executed; see results and limitations below. No claim of a fully passing repository-wide suite.

## Implementation and verification record

Implemented in the approved shared web route. The desktop application navigation, compact searchable conversation list, conversation/composer, and contextual details rail share the existing providers. At smaller widths the details move to a drawer; below 1024px the existing list/conversation navigation remains. The 320px conversation header uses two rows, and touch controls remain at least 44px where changed. Mixed document/image attachments stack vertically, while consecutive images retain their grid.

Actions and action-type creation, important/critical tags, owner/due-date selection, mentions, replies, issue history/transitions, emoji, attachments, audio, Lisno AI, participant administration, project status, and drafts retain their existing handlers. Backend and native-mobile sources, contracts, and dependencies were not changed. Status details show real workflow facts and files explicitly describe the retained message window.

Principal implementation files:

- Shared integration: `frontend/src/features/messages/ProjectMessagesPage.tsx`, `projectChat.css`, `projectChatShell.css`, and messaging-only changes in `AppShell.tsx`/`common-shell.css`. `Sidebar.tsx` now marks Project messages current on a selected conversation route.
- List: `ProjectConversationList.tsx`, `projectConversationList.css`, `projectChatApi.ts`, and `projectChatTypes.ts`; existing API search/filter/preview/totals contracts are consumed without backend changes.
- Details: `ChatProjectDetails.tsx`, `chatProjectDetails.css`, and the minimal media action export in `ChatMessageAttachments.tsx`.
- Presentation icons: feature-local `ChatIcon.tsx` used by the existing composer, timeline, attachment/audio, and menu controls.
- Regression/QA: API, provider, list, page, details, and synthetic transport tests; `enterpriseMessagesData.ts` and the opt-in `qaMessages=ready` transport hook.

The approved baseline preserved existing Project Manager notifications, `draft=project-update`, role/authorization work, and unrelated dirty sources. The pre-existing messaging AI test fixture omitted the renderer's required `project-publication-v1` disclosure marker; the mock was corrected without changing AI behavior. Independent integrity review found no outstanding production defect. Its one fixture finding (loading/error interception) was fixed and covered by new transport tests.

### Executed checks

All commands below ran from `frontend/` unless noted.

| Check | Result |
| --- | --- |
| `npm test -- src/features/messages src/features/project-status` | Passed: 314 tests, 23 files. |
| `npm test -- src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/test/accessibility.test.tsx src/test/fixtures/enterpriseMessagesTransport.test.tsx src/test/fixtures/enterpriseTransport.test.tsx` | 361 passed, 3 failed. Router, navigation, AppShell, accessibility, and new messaging transport passed; failures are in existing enterprise transport scenarios described below. |
| `npm run typecheck` | Passed. |
| `npm test` | 5,656 passed, 97 failed; 363 passing and 9 failing files, 372 files total. No messaging or project-status failures. |
| `npm test -- src/test/accessibility.test.tsx -t "keeps My Projects and initiation keyboard accessible with estimator selection and error focus"` | Passed: 1 selected test, 30 skipped. This focus assertion failed only in the full run; the entire 31-test accessibility file also passed in the focused run. |
| `npm run build` | Passed after the final CSS changes: 3,261 modules, Vite build 9.54s. Existing large-bundle warning remains (largest index chunk approximately 3.02 MB, 831 KB gzip). |
| Repository `git diff --check` and `git status --short` | Checked; whitespace check passes. Unrelated dirty work retained. |

Full-suite failures outside the messaging change: `KnowledgeModeLayout` (1), `KnowledgeItemWorkspaceLayout` (4), `KnowledgeModeSectionStateRemoval` (27), `KnowledgeScreens` (16), `LeadDetail` (10), `AskLisnoLauncher` (34), `EstimateReviewPanel.collapsible` (1), existing `enterpriseTransport` (3), and the isolated-passing accessibility focus assertion (1). The knowledge, lead, Ask Lisno, and estimate source/test files have no current diff. The full pre-redesign suite was not reconstructed, so these are reported as out-of-scope failures rather than claiming a complete baseline rerun.

The independent reviewer traced the three enterprise transport failures to existing mismatches also present in HEAD: the Client document fixture lacks `projects.design_workflow.read`; two legitimate, different project IDs share the name Aurora Villa while the gallery test expects a unique article by name. Those scenarios do not enable the messaging transport. No production authorization was weakened to satisfy them.

### Rendered checks

- Inspected screenshots at desktop/tablet/mobile widths including 1920, 1440, 1024, 768, 390, and 320px; also measured 1280px. No document horizontal overflow across all seven widths. A draft survived 320 → 390 → 768 → 1024 → 1280 → 1440 → 1920 → 320 resizing with no content loss. The details rail is present at 1440px+ and absent below it.
- Checked 200% equivalent reflow using a 720×500 CSS viewport at device scale 2 for a 1440×1000 output. No overflow; composer remained visible and automated accessibility scan reported zero violations. Native browser zoom shortcuts did not change the emulated viewport, so this is reflow emulation rather than a native zoom claim.
- Rendered all 16 active roles (Super Admin, Admin, Estimator/Sales, Designer, Procurement, Finance Head, Project Manager, six worker roles, Design Manager, Design Head, Client). Authorized shared conversations and Actions remained present; rename remained restricted to the fixture's Admin/Super Admin capabilities. The retired Program Manager identity did not receive messaging access.
- Verified writable and read-only fixtures, explicit denied access, loading, empty, error/retry, search beyond the first page, filter empty state, search-clear focus, and no unexpected API requests. Error state was checked after query retries settled.
- At 320/390px exercised Actions, selecting Design review with an owner and due date, keyboard mention selection, retained action draft, and sending the tagged message. The committed message retained the tag/owner/due date and cleared the composer. Checked details → participants, Escape/focus return, and retained participant editor state through integration tests.
- Opened an authenticated image preview from details and played the synthetic audio. No original file download occurred before an explicit user action. Checked bounded file labels and mixed attachment layout. Existing upload/retry/cancellation/voice/AI feature tests passed.
- Axe scans reported zero violations in the inspected wide, narrow, action-dialog, details-drawer, and reflow states. Console checks showed no warnings/errors; expected error responses were limited to selected failure fixtures.

### Boundaries and temporary artifacts

No deployment, migration, seed, commit, push, customer communication, dependency install, or backend/native-mobile mutation was performed. No lint command exists. Backend/OCR/native-mobile suites were not run for this frontend-only scope. Browser QA used synthetic local data; live backend/customer records, successful real-file uploads, and microphone hardware were not exercised. Native zoom and full accessibility conformance are not claimed.

Baseline and verification logs are retained for diagnosis in `/tmp/lisno-messages-redesign/`, including `final-messages-status.log`, `final-shell-fixtures.log`, `final-typecheck.log`, `final-full-tests.log`, `final-full-failures.txt`, `final-accessibility-recheck.log`, and `final-build.log`. Screenshots were inspected inline, not stored in the repository. Build output updated the already-existing ignored `frontend/dist/`; already-existing ignored Vite caches were retained. The task-owned browser and preview server are closed at handoff.

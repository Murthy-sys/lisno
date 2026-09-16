# Project group chat implementation task plan

Date: 2026-09-16
Status: WhatsApp UI revision implemented and locally verified; known baseline failures and environment limits documented below
Source of truth: [Project group chat specification](../specs/2026-09-16-project-group-chat-design.md)
Specification approval: The user approved the core specification and, subsequently, its WhatsApp group-chat visual revision in this conversation on 2026-09-16. The revised specification is the accepted baseline; this planning stage does not edit that file.
Execution mode: A — parallel sub-agents, selected by the user on 2026-09-16.

## Outcome and boundaries

Current revision: implement the approved WhatsApp group-chat presentation at phone, tablet and desktop sizes while preserving the locally implemented messaging behavior. The W0–W6 plan below governs this revision. The original T0–T10 plan and its completed verification ledger remain as historical implementation evidence, not instructions to rebuild the backend or repeat completed work.

Implement one shared project conversation with current/selected participants, authenticated live messages, structured `@` mentions, quoted replies, personal unread counts, Important/Critical discussion items, and the open-critical count at the project top. Preserve the approved specification's permission matrix, client visibility, participant history rules, and separation from formal tasks, approvals, finance, and KPI.

Use the existing React/TanStack Query and Express/Mongoose architecture. HTTP mutations persist before acknowledgement; authenticated streaming fetch consumes SSE backed by a durable project event log. Mongo change-stream wakeups and durable-log reconciliation support delivery between API processes. No runtime dependency or lockfile change is planned.

Original planning-stage worktree baseline: only `docs/superpowers/specs/2026-09-16-project-group-chat-design.md` was untracked; there were no tracked application changes. The current visual-revision baseline contains the complete uncommitted implementation listed in the historical ledger. Preserve it and the approved specification. Before revision writers start, capture fresh dirty paths and relevant tracked diffs plus copies/hashes of already-untracked target files.

This plan permits local implementation and isolated verification only after task-plan approval and execution-mode selection. It does not authorize commits, pushes, deployment, live data/index changes, seed scripts, external communication, or modifications to existing real user/project data.

## WhatsApp UI revision implementation plan

Specification source: [approved visual revision and UI1–UI7](../specs/2026-09-16-project-group-chat-design.md#whatsapp-group-chat-visual-revision--2026-09-16). Execution mode remains the user's previously selected A. The user approved this materially revised plan on 2026-09-16 before application edits began.

### Evidence and fixed boundaries

- The current Messages page stacks a page heading, project tabs, toolbar and filter row over a transcript fixed to 43/47dvh. The composer is a tall form. These are the structural causes of the mismatch with the approved reference.
- `AppShell.tsx` owns the persistent `ProjectChatProvider`, app rail, mobile header and fixed client assistant launcher. `shell.css` applies padded, measured workspaces. Both chat routes need a bounded messaging variant while other routes retain their existing presentation.
- `ProjectChatHeader.tsx` currently registers the active project inside `ProjectChatNavigation`. The redesigned page must call `useChatProjectRegistration(projectId)` when it replaces that row; sidebar items never register projects.
- `ChatTimeline.tsx` uses its scroll element as the read-observer root and preserves older-history anchors. `RouteFocusManager` selects the first `h1` in `main`; the sidebar must not steal focus from the active conversation. Desktop/mobile details currently risk duplicate panel mounts and must become one presentation.
- `ChatConversation` supplies identity, participant count, project status, counts and last-message time. No snippet, photo, online presence, recipient receipt, search endpoint or attachment contract is available. Use actual fields; preserve the approved exclusions.
- Existing frontend chat tests, backend behavior and previous browser evidence provide a preservation baseline. Earlier passing totals are historical results; verify the revised integrated tree again. The seven pre-existing full-suite failures are documented below and are not part of the UI scope.
- This revision changes frontend presentation, layout and tests only. Backend files, shared DTO/API/authorization contracts, SSE implementation, finance, estimates and workflow rules are outside its write scope. No dependency/lockfile changes, migrations or external actions are planned.

### Exclusive ownership for Mode A

| Owner | Write boundary | Must preserve |
| --- | --- | --- |
| Primary integrator | This plan; `components/layout/AppShell.tsx`, `MobileHeader.tsx` or a focused extracted navigation trigger; `styles/shell.css`; `app/router.tsx`; shared shell/navigation/focus tests; `features/messages/index.ts`; `ProjectMessagesListPage.tsx`; new `ProjectChatLayout.tsx`, `ProjectConversationList.tsx`, `projectChatShell.css`, and their focused layout tests. | Auth/provider lifetime, route permissions/URLs, skip link/main landmark, existing workspace navigation/logout, overview entries, all non-chat role layouts. |
| Frontend implementer | `features/messages/ProjectMessagesPage.tsx`, `ChatTimeline.tsx`, `ChatComposer.tsx`, `ChatIssueDialog.tsx`, `ChatParticipants.tsx`, `projectChat.css`, their existing tests, and small feature-local presentation helpers/tests if required. | Existing component props unless coordinated first; registration, visibility/read root, scroll anchors, stable mentions, IME, drafts, retry IDs, issue capability checks, history and access recovery. |
| Integrity reviewer | Read-only review of the integrated revision and relevant preserved contracts. | No source edits, contract changes or separate redesign. |
| Verification runner | Read-only integrated checks plus isolated temporary browser fixtures/artifacts. | No product edits, real-user data, secrets in output or shared developer database. |

The primary's new shell styles use `.project-messaging-*` classes and scoped host tokens. The frontend implementer exclusively owns the existing `.project-chat-*` stylesheet. Agree on the small host sizing/token contract in W0; do not concurrently edit the same stylesheet or invent incompatible layout wrappers. Existing `ProjectChatHeader.tsx` overview consumers, `ProjectChatProvider.tsx`, query/stream/state modules and contracts remain unchanged unless a concrete integration need is returned to the primary for explicit ownership. Removing an obsolete visual rule must not change overview badges elsewhere.

Every writer must be told: “You are not alone in the codebase. Preserve other edits; do not revert or overwrite another owner's work.” Assign already-dirty paths only after their baseline is understood. If native child capacity is exhausted, reuse an existing agent for a bounded role rather than creating overlapping writers. Review and final verification follow implementation sequentially.

### W0 — Freeze the UI integration contract and preservation baseline

Owner: primary. Dependencies: approval of this revised task plan. Acceptance: UI1, UI5, UI7.

- Capture `git status --short`, per-target tracked diffs and a temporary baseline of the already-untracked messages feature. Record exact owned paths before edits. Do not stage or commit to obtain a baseline.
- Retain the two canonical routes and their authorization registrations. Choose a persistent pathless messaging layout under AppShell: one reusable list pane, one selected-conversation outlet and an empty selection view. Keep the provider above this layout so resizing/navigation cannot replace the session store.
- Agree on a viewport-height host, `min-height:0` children, independent pane scroll owners, single-column behavior below 1024px, and approximately 320–360px list width on desktop. Keep the selected page mounted on viewport changes.
- Fix the cross-owner interface: the current timeline/composer prop contracts remain stable; the page owns active-project registration; the list owns only its bounded query/pagination; the new layout never opens a project stream. The existing list route becomes the empty-selection view inside that layout.
- Establish local chat tokens, system typography and reference fixtures containing short/long messages, Unicode, duplicate names, consecutive senders, quotes, priorities, failed attempts and more than one history page. No contact photos or conversation text are fabricated as real server data.
- Completion: both writers can implement independently against the same host contract; no unresolved product decision remains.

### W1 — Build the full-height shell and project conversation list

Owner: primary. Dependencies: W0. May run in parallel with W2. Acceptance: UI2, UI3, UI5, UI7.

- Add a route-specific AppShell presentation for messaging. Preserve `ProjectChatProvider`, the main landmark and skip link; remove the dashboard rail, fixed mobile header, workspace padding/measure and client floating launcher only on those routes.
- Supply compact, accessible application navigation/logout and a Back to workspace action by reusing the existing Sidebar/Drawer behavior. Keep safe remembered project-overview navigation available without inventing a module URL for chat-only users.
- Mount the shared messaging layout at the existing route paths. On desktop show list and conversation; on phone/tablet show the list or selected conversation with Back. Do not redirect to or auto-select a project merely to fill the desktop pane.
- Extract the current list into compact project rows with initials, real last-message time, unread/mention counts and Critical metadata. Reuse the existing paginated query and 15-second foreground reconciliation, preserving list offset/scroll through conversation switches.
- Make the selected conversation's heading the route-focus destination; use subordinate headings in a persistent sidebar. Keep loading, unavailable, list failure and empty selection states usable.
- Completion: shell/layout tests prove chat routes use the new presentation, non-chat routes retain existing chrome, navigation/logout remain reachable, and list rows create no chat streams or per-row message fetches.

### W2 — Implement the WhatsApp group-conversation presentation

Owner: frontend implementer. Dependencies: W0. May run in parallel with W1. Acceptance: UI1, UI3, UI4, UI6.

- Replace the page heading and stacked toolbar with a compact group header containing initials, project name, participant summary, `Critical N`, truthful connection status and accessible secondary actions. Move registration to the page through the existing hook. Keep filters accessible with an obvious active-filter/reset state.
- Render one participants/issues presentation at a time, using an accessible drawer or details surface suited to available width. Restore focus on close. Keep issue reasons, ownership controls, recent history and participant management available under their existing capabilities.
- Restyle the transcript using white incoming and pale-green outgoing content-sized bubbles, stable readable sender colors, grouping, small tails, compact time/send state, centered date pills, quotes and a quiet original vector/CSS pattern. Retain a stable per-message DOM anchor and chronological accessible content.
- Replace per-bubble button rows with touch/keyboard-operable action menus. All current Reply, issue, history and View in conversation behavior remains reachable. Pending/failed attempts keep clear real status and retry/edit actions; no fabricated delivery/read receipts.
- Replace the default tall form with a rounded auto-growing input, green circular Send control and compact Message importance action. Show reply and selected priority before send; reveal owner/priority controls on demand. Keep character-limit and validation messages accessible without permanent visual clutter.
- Bound mention suggestions, expanded composer controls and dialogs to the visible viewport. Preserve explicit stable-ID selection, IME and mobile multiline behavior. Use CSS sizing first; coordinate any necessary visual-viewport lifecycle helper with the primary after browser evidence.
- Retain the actual read-observer root, older-history anchor, new-message affordance and actual-view read acknowledgement. Date/unread decorations and bubble grouping must not mark unseen messages read or cause scroll jumps.
- Extend the existing observer mock to capture constructor options and assert that its root is the actual timeline scroller. Add meaningful prepend/arrival scroll assertions; the current mock alone cannot detect a misplaced scroll root, and real-browser geometry checks remain necessary.
- Completion: focused message/composer tests prove the new controls retain the existing behavior; the normal conversation has no large page header, form stack, card frame or permanent message action toolbar.

### W3 — Integrate and resolve responsive and role-style conflicts

Owner: primary, with the frontend writer returning scoped fixes after a clear handoff. Dependencies: W1 and W2 finished. Acceptance: UI1–UI7.

- Integrate the two slices, remove obsolete selectors/wrappers within their ownership and inspect imports/exports. Preserve one mounted page, one active registration and one stream per selected project.
- Verify transcript/list scroll separation, full-height sizing, composer growth, safe areas and the 1023/1024px transition in the real authenticated AppShell. Keep drafts, filter/quote context and read position through resize and project switches.
- Check representative client, designer and chat-only worker roles. Resolve theme selectors affecting buttons, typography and portalled dialogs through narrow chat-scoped rules, without modifying global role styling wholesale.
- Keep project-overview Messages links and Critical badges working. Verify safe exits and browser Back, including a direct chat-only deep link.
- Completion: no known integration defect remains; code is ready for read-only integrity review.

### W4 — Review integrity before final verification

Owner: integrity reviewer. Dependencies: W3; all writers paused. Acceptance: UI4–UI7 and preserved AC1–AC12.

- Review session/provider lifetime, project registration, hidden/filtered read acknowledgement, same-key retry, stale mention/owner handling, revocation/regrant and safe overview navigation.
- Review focus order/restoration, touch access to message actions, one panel instance, long-content wrapping, bounded listeners and absence of unintended backend/contract edits.
- Report concrete findings with affected files and reproduction. The relevant owner fixes confirmed findings; rerun affected focused checks and reconcile the final diff before W5.
- Completion: no unresolved feature regression or authorization/session concern remains. Review findings are evidence, not a substitute for executed checks.

### W5 — Verify behavior and visual fidelity on the integrated tree

Owner: verification runner; primary resolves environment blockers and inspects final screenshots. Dependencies: W4 findings resolved. Acceptance: UI1–UI7.

Run from `frontend/`:

```sh
npm test -- src/features/messages
npm test -- src/components/layout/AppShell.test.tsx src/components/layout/navigation.test.tsx src/components/layout/RouteFocusManager.test.tsx src/app/routePaths.test.ts src/app/router.test.tsx
npm test -- src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx
npm run typecheck
npm test -- --maxWorkers=3
npm run build
```

Include any new layout test in the feature directory so the focused command covers it. Preserve the original 44 feature regressions semantically, adapting their interaction steps to the approved menu/composer presentation. Add meaningful layout/stream/read/focus regressions; do not write pixel-value mirror tests. The full frontend suite is justified by AppShell/router changes. Backend/OCR source remains untouched, so those full suites are not repeated for this visual revision; the live browser scenario still uses the real backend.

Rendered verification matrix:

| Check | Required evidence |
| --- | --- |
| Reference fidelity | Open screenshots as images beside the approved reference; inspect group header, bubble shape/density/grouping, names/times, quotes, pattern, priority and bottom composer with authentic content lengths. |
| Widths | 320, 360, 390, 768, 1024, 1440 and 1920px, plus 1023px boundary and approximately 844 × 390 landscape. No document horizontal overflow or clipped essential actions. |
| Keyboard and zoom | Reduced keyboard-height viewport (for example 390 × 420), focused composer, multiline/4,000-character draft, mention/options popup, safe-area support, 200% zoom/reflow. Report physical-device testing separately if available. |
| Keyboard/accessibility | Tab order, accessible names, Enter/Escape/arrow mention behavior, IME, action menus, drawers/dialogs, focus return, contrast and reduced-motion emulation. Run rendered accessibility assertions; a single automated audit is not a complete conformance claim. |
| Live behavior | Two independent synthetic sessions on real isolated API processes: mention/send/quoted reply, priority raise/resolve and counts without reload. Record observed latency, status/console failures and navigation counts. |
| Scroll/read state | More than one history page, prepend anchor, arrival while reading older content, explicit jump to latest, hidden tab, filtered/around view, long bubble and issue history expansion. Confirm only viewed messages advance read state. |
| Session/navigation | Switch projects with drafts; resize split/single pane; one selected-project stream; access denial/regrant and late responses; direct worker chat link with safe exit; no per-row history requests. |
| States and preservation | Empty/list loading/history error/reconnect/failed-send retry/unavailable states; representative client/designer/worker full AppShell and a non-chat workspace for each. Existing overview Messages/Critical entry stays intact. |

Use disposable synthetic `.test` fixtures and a disposable replica set for live browser evidence. Reuse/adapt the existing temporary test harness, but mount the actual AppShell and route layout rather than the earlier standalone content shell. Do not use real user data, a developer database or seed scripts. Keep browser outputs under `/tmp/lisno-whatsapp-chat-ui-qa/` or the repository's ignored QA output location, and never print session tokens. Use ordinary Playwright commands if multi-context CLI scripting repeats the previously recorded socket failure.

Record exact executed commands/results and limitations. Compare known full-suite failures against the existing baseline; investigate new failures instead of assuming every failure is pre-existing. Tests run during concurrent writes do not count as final integrated verification.

### W6 — Final reconciliation, cleanup and handoff

Owner: primary. Dependencies: W5 and any resulting fixes/rechecks. Acceptance: UI1–UI7.

- Inspect the final diff against the captured revision baseline, including already-untracked files. Run `git diff --check` and `git status --short`. Ensure only approved frontend/document scope changed and no dependency, lockfile or runtime artifact entered the repository.
- Close only owned browsers, Vite/API processes and disposable replica sets; remove temporary credentials. Retain only useful non-secret verification artifacts in the recorded temporary directory.
- Update this plan with outcomes for UI1–UI7, exact tests/build results, browser widths/scenarios, screenshot paths, unrun checks and any remaining defects. Historical backend/core results remain labelled as historical.
- Handoff states what changed and what was actually verified, including known baseline failures and device/proxy limits. Do not claim pixel identity for uninspected platforms, successful physical keyboard testing from viewport simulation, or a clean full suite if baseline failures remain.

### Dependency graph and current revision ledger

Only one parent phase is in progress at a time: baseline/contract (W0), construction (W1 + W2), integration (W3), integrity review (W4), verification (W5), then handoff (W6). W1 and W2 are the safe parallel implementation slices; they have separate files and stylesheets. W4 and W5 run sequentially after writers finish.

| Item | Current status |
| --- | --- |
| WhatsApp visual specification | Approved by user on 2026-09-16. Approval is recorded here without editing the specification during the plan-only stage. |
| Revised task plan | Approved by user on 2026-09-16. |
| Execution mode | Existing A selection retained. |
| W0 | Baseline captured; shared layout/ownership contract established. |
| W1/W2 | Complete: dedicated messaging shell/list, group conversation, menus, bubbles and compact composer. |
| W3 | Complete: role-style isolation and real-browser resize anchoring verified. |
| W4 | Complete: independent review findings fixed and re-reviewed; no outstanding findings. |
| W5 | Complete: focused/full frontend checks, production build, real two-session delivery, width matrix and rendered accessibility checks recorded below. |
| W6 | Final reconciliation complete; owned test-runtime cleanup recorded below. |
| Dependencies, deployment, migrations, production/external actions | None authorized or performed for this revision. |

Revision baseline: `/tmp/lisno-whatsapp-ui-baseline-20260916-133220` contains the initial dirty-path inventory, tracked diff and copies/SHA-256 hashes of 30 frontend files (including the already-untracked feature). Native agents were reused for frontend implementation, independent integrity review and isolated runtime preparation. No backend or shared API/authorization contract writes are in this revision.

Construction evidence: the six new layout regressions passed, including client/designer/worker shells, main/skip link, safe workspace exit, no list subscriptions, persistent pagination/scroll, route focus, drafts, one active stream and navigation/logout drawer. Initial existing AppShell/RouteFocusManager checks passed 26/26. The integrated conversation feature tests are rerun after all fixes; these preliminary runs do not replace final verification.

### Final visual-revision outcome — 2026-09-16

The two existing authenticated chat routes now share a full-height messaging layout. Desktop shows a compact project list beside the conversation; mobile/tablet shows one pane with Back. The provider stays above the layout, and only the selected conversation registers a stream. Group headers, content-sized white/green bubbles, grouped senders, small timestamps, inset quotes, a subtle original pattern and a rounded composer implement the approved light WhatsApp composition. Real Critical counts, participant controls, issue history, drafts, mentions and the visible shared-client audience notice remain available.

Revision source changes: `AppShell.tsx`, `app/router.tsx`, and the messages feature's `ProjectChatLayout`, `ProjectConversationList`, `ProjectMessagesListPage`, `ProjectMessagesPage`, `ChatActionMenu`, `ChatTimeline`, `ChatComposer`, `ChatIssueDialog`, `index.ts`, two local stylesheets and focused tests. No dependency or lockfile change. Baseline comparison confirmed the only changed tracked diff blocks were AppShell/router; existing provider, API, types, queries, stream, state and participant modules retained their captured hashes. Existing backend tracked diffs were unchanged by the visual revision.

Integration/review fixes:

- Real resize testing found that a reader at the bottom could end up on older messages after narrowing the screen. Timeline ResizeObserver/window fallback now preserves bottom intent or the visible message anchor, including an early browser scroll event during resize.
- Independent review found the new hardcoded `/home` exits denied several roles. List exits now use `roleHomePath`; the conversation menu uses the canonical `/` redirect. Regression assertions cover client, designer and worker destinations.
- Restored the approved persistent visible “Shared with the client and project team” reminder.
- Rendered axe found the inherited purple participants-drawer eyebrow had 4.16:1 contrast. A narrowly scoped dark-green rule fixes the drawer and chat dialog eyebrows. The affected browser audits were rerun with zero violations.

#### Executed frontend checks

Run from `frontend/`, with all behavior writers finished. The focused commands from W5 were combined into one equivalent Vitest invocation to avoid repeated setup:

```sh
npm test -- src/features/messages src/components/layout/AppShell.test.tsx src/components/layout/navigation.test.tsx src/components/layout/RouteFocusManager.test.tsx src/app/routePaths.test.ts src/app/router.test.tsx src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx --maxWorkers=3
npm run typecheck
npm test -- --maxWorkers=3
npm run build
```

| Check | Result |
| --- | --- |
| Messages feature | 61/61 passed: page 23, composer 7, timeline 5, layout 6, stream 7, API 2, state 11. |
| Combined focused run | 430 passed / 1 known baseline failure across 14 files; the failure is the unchanged signup Address-label expectation. |
| TypeScript | Passed. |
| Full frontend suite | 2,737 passed / 4 failed; 192 passed / 4 failed test files, 196 total. Exactly the four previously established baseline failures below. |
| Production build | Passed; existing large-chunk advisory remains. Rebuilt after the final scoped contrast CSS correction. |
| Repository hygiene | `git diff --check` passed; final dirty-path inventory reviewed against the preserved baseline. No runtime artifacts or lockfiles introduced. |

The four frontend baseline failures are `app/router.test.tsx` (signup Address label), `auth/PasswordResetPage.test.tsx` (input clearing), `test/accessibility.test.tsx` (access-request drawer focus), and `features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts` (legacy margin pending-change expectation). Their unchanged-HEAD reproduction is recorded in the historical ledger. No new full-suite failures were observed. This is not a claim that the entire repository suite is green. No lint script exists. Backend/OCR full suites were not repeated for this frontend-only revision; historical core/backend results remain below.

Logs: `/tmp/lisno-whatsapp-chat-ui-qa/frontend-focused.log`, `frontend-typecheck.log`, `frontend-full.log`, `frontend-build.log`, and `frontend-build-final.log`. The full suite ran before the last two-selector contrast-only CSS correction; rendered axe and the production build were repeated after that correction.

#### Rendered browser evidence and acceptance trace

Temporary Vite fixtures mounted the actual App, router, AppShell, provider and chat components. Only synthetic auth bootstrap was supplied by the harness. Chat REST/SSE requests used the actual routes/services and two separate API processes against a disposable replica set. All names and project content were synthetic. No shared developer/production database was used.

| Acceptance | Evidence |
| --- | --- |
| UI1 / UI2 | Screenshots captured at 320×740,360×800,390×844,768×1024,1023×800,1024×800,1440×1000,1920×1080,844×390 and390×420. At every size document width did not overflow, document height equalled viewport height, composer bottom equalled viewport bottom, and a reader at the newest message retained a zero bottom gap. List hidden at 1023 and visible at 1024. Mobile 320/390, desktop 1440, designer desktop and keyboard overlays were opened and visually inspected. |
| UI3 | At 390×420 a 4,000-character multiline Unicode draft kept Send enabled and visible; input height 99px, composer bottom 420px, no horizontal overflow. Mention popup outer container was 126px tall, scrollable, bounded between y 216 and 342. Keyboard selection worked.720 × 500 reflow simulation (1440×1000 at 200% equivalent CSS viewport) retained all controls without overflow. |
| UI4 | Client sent a Critical item with an explicitly selected electrician mention and responsible person. Electrician received it without refresh, replied with a client mention and quoted original, and client resolved the issue with a reason. Both headers changed 3 → 4 → 3 and the second session displayed Resolved. Each document retained one navigation entry during the exchange. Receiver DOM updates were observed 149ms and 90ms after the sender recorded the successful response; these are local observations, not a production SLA. |
| UI4 scroll/read | Receiving while reading older content retained scrollTop 500. Prepending ten older messages preserved the original visible anchor within 0.44px. Resizing a reader's older-history anchor from 1024px to 390px preserved it within 0.41px. Observer-root, hidden/filtered read rules, retry, session isolation and issue behavior remain covered by the 61 focused regressions. |
| UI5 | Actual client, designer and worker shells rendered chat without dashboard rail/mobile chrome. Workspace exits reached `/client`, `/designer`, `/home` and restored the corresponding role AppShell. Draft survived conversation→list→conversation. Tests verify project switching, persistent pagination, one active stream, access recovery and no per-row history requests. |
| UI6 | axe returned zero violations on the normal chat, participants drawer and importance dialog after correction. Menu→issue-dialog close returned focus to the originating message action; participant drawer and importance dialog Escape returned focus to their triggers. Mention arrow/Enter selection and reduced-motion emulation passed. Critical filter and explicit return-to-latest worked. Automated loading/error/reconnect/retry/permission states passed; not every such state received a separate screenshot. |
| UI7 | Client/designer/worker normal-shell restoration was asserted in the actual browser and in focused tests. Shared AppShell/navigation/focus/Drawer/Dialog regressions passed. Scoped chat styles leave normal role classes intact; provider/authorization/overview contracts were not rewritten. |

Artifacts live under `/tmp/lisno-whatsapp-chat-ui-qa/`: `final-<width>x<height>.png`, `final-designer-desktop.png`, `final-list-720x500.png`, `final-mentions-keyboard.png`, `final-participants-keyboard.png`, and `final-200percent-reflow-equivalent.png`. CLI snapshots/logs are in its `.playwright-cli/` directory. Temporary outputs are outside the repository and are not deliverables to commit.

Limits: Chromium desktop automation simulated viewport/keyboard/reflow changes; physical iOS/Android keyboards, device safe-area hardware, browser-native 200% zoom, Safari/Firefox and production proxy/load behavior were not tested.720 × 500 is explicitly a zoom-equivalent reflow check, not a native browser zoom claim. Non-chat workspace destinations/shells were verified, but the chat-only API fixture does not implement their data endpoints: visiting those modules produced expected 404s for project summaries/tasks/KPIs. Chat flow produced no browser console/network errors. Full data-loaded non-chat screenshots were not produced; the relevant application regressions cover those modules. No claim of pixel identity with every native WhatsApp version is made.

Cleanup confirmed: both named Playwright sessions and both owned temporary Vite servers were stopped. The runtime owner stopped the disposable API children and replica set gracefully; the runtime exited successfully, its recorded processes are absent, and the private `runtime.json` credential file was removed. No commit, push, deployment, seed script, migration, external communication or production mutation was performed.

## Original implementation: evidence affecting implementation

- Existing account/permission changes use `AppRepository.coordinateAuthorizationMutation`, backed by `AuthorizationCoordinationModel` in Mongo. Access-grant decisions/revocations, user administration, password-reset completion, and some project operations already participate. Several direct-Mongoose assignment paths need compatible coordination for the chat send/revocation race.
- Direct source writers include `services/project-workflow.service.ts` (designer and trade/procurement assignees), `routes/estimates.ts` (review assignments), and estimate approval/handoff/lifecycle services. The implementation must map exact source transitions before inserting hooks; it must not blanket-refactor these services.
- `frontend/src/auth/AuthProvider.tsx` already cancels and clears TanStack Query state on session termination. Chat streams and in-memory drafts need to follow that session lifecycle, including protection against late responses from an old session.
- Frontend authorization parsing accepts valid policy identifiers and filters known permissions. Preserve this rolling-version behavior while adding chat permissions; do not introduce exact-version rejection.
- `backend/src/models/application-indexes.ts` is the index preparation boundary. Add chat models there; local tests use isolated indexes. Do not run destructive index synchronization against an existing database.
- `backend/tests/helpers/mongo-replica-set.ts` creates a disposable replica set. Reuse that helper for real transactions and change streams. Cross-process tests must point both isolated API processes at its test URI, with external email disabled.
- No repository-wide browser QA script or lint script currently exists. Use the available browser tooling for rendered QA; an isolated test harness may be added as described below, without adding a browser dependency just to invoke an already available tool.

## Ownership and execution rules

In Mode B the primary agent performs every task inline, sequentially, including review and verification. The role labels below describe responsibilities, not permission to spawn agents in Mode B.

In Mode A use these exclusive write boundaries after the shared contracts are fixed:

| Owner | Exclusive boundary |
| --- | --- |
| Primary integrator | Approved documents/progress ledger; shared DTO contracts and permission/operation/API inventory; all pre-existing backend/frontend files; app/server/index wiring; role-screen/navigation integration; cross-stack reconciliation. |
| Backend implementer | New chat domain/model/repository/service/REST-route files and focused backend tests, except the shared DTO contract and new realtime files assigned below. |
| Realtime implementer | New `backend/src/services/project-chat-events.service.ts`, `backend/src/services/project-chat-stream.service.ts`, `backend/src/routes/project-chat-events.ts`, and stream/cross-process test files. No writes to the REST service, shared repositories, app/server wiring, or existing authorization code. |
| Frontend implementer | New `frontend/src/features/messages/` files and their tests, except the primary-owned `projectChatTypes.ts` contract; no writes to existing role screens, route registries, shared API/auth files, or global styles. |

The primary integrator writes shared contracts before downstream agents start. Repository/event interfaces must be ready before the realtime implementer uses them. Where an existing regression file needs updates, its owner is the primary integrator; workers supply suggested cases or results without editing that file.

Each assignment must state the exact files, acceptance criteria, contract inputs, and invariants, and tell the worker: “You are not alone in the codebase. Preserve other edits; do not revert or overwrite another owner's work.” Any contract change returns to the primary integrator and is communicated to all affected owners before further dependent edits.

Keep one parent implementation phase in progress. Multiple child tasks may run inside that phase when their dependencies and write boundaries allow it. Do not start a new parent phase merely because one child finished.

## Dependency-ordered tasks

### T0 — Confirm the approved baseline and source-transition inventory

Owner: Primary integrator. Dependencies: task-plan approval and execution-mode selection. Covers AC1–AC3, AC10–AC11.

- Capture the initial implementation dirty paths and per-target diffs; preserve unrelated changes and re-check the approved specification against any intervening code changes.
- Record the current precedence of project, lead, estimate-review, design-plan, and canonical trade assignment sources. Distinguish current sources from historical reviewers, obsolete design-plan versions, and broad task queues.
- Enumerate every normal source mutation that can change effective membership: project/client linkage; Sales/manager/designer assignment; approved estimate/design-plan lineage; trade/procurement assignee changes; grants; explicit chat selections; role/active/session-version changes. Record its transaction and coordination boundary in this plan's execution ledger.
- Identify safe project-header/navigation integration for each existing role screen and for selected users without another project module.
- In Mode A only, bounded read-only membership/authorization and frontend-route audits may run alongside the primary's integration-contract work; do not delegate duplicate questions. No implementation starts before their relevant findings are reconciled.
- Completion: every membership source has an explicit eligibility rule, mutation owner, reauthorization mechanism, and regression scenario. Material changes to approved behavior return to the applicable approval gate; routine implementation choices do not reopen it.

### T1 — Establish shared contracts and register the authorization boundary

Owner: Primary integrator. Dependencies: T0. Covers AC1–AC6, AC8–AC11.

Affected areas: new `backend/src/contracts/project-chat.ts` and `frontend/src/features/messages/projectChatTypes.ts`; existing backend `domain/authorization.ts`, `domain/route-operations.ts`, `domain/audit-actions.ts`, `services/auth.service.ts`, `openapi.ts`; existing frontend `api/authorization-contract.ts`; related inventory/policy test fixtures. A focused `backend/src/openapi/project-chat.ts` may hold schemas, following the existing OpenAPI split.

- Define concrete DTOs, capabilities, error codes, message/issue actions, request versions/idempotency keys, participant sources, snapshot/replay cursors, event envelopes, and chat repository/transport injection interfaces.
- Add narrow chat read/send/issue/read-state and participant-management permissions. Participant-management role permission is limited to `admin`/`super_admin`, with assigned-project checks in the service. Discussion action ownership remains service-enforced.
- Register a `project_chat` service-scoped operation namespace. Specify Super Admin read/send/issue/self-read behavior explicitly; do not loosen unrelated `deny_personal` operations or broaden existing project module grants.
- Fix the exact participant revoke route under the approved endpoint family and document its expected version/reason. Provide capability-safe, no-store response shapes and non-disclosing denied-resource errors.
- Fix cursor ordering, snapshot consistency, same-project around-message lookup, and filter semantics. Query keys include user/project/filter; canonical messages merge by ID and version.
- Specify mention offsets in JavaScript-compatible UTF-16 units with well-formed, non-overlapping spans matching the submitted text; preserve Unicode when editing/sending and enforce the approved body/target limits. A stale or edited mention token requires explicit correction, not retargeting by display name.
- Define private read-state events so only that user receives their payload; filtering such events must not stall another participant's replay cursor or reveal another person's read receipt.
- Maintain frontend/backend permission mirrors, OpenAPI route coverage, audit vocabulary, and the established rolling-version parser behavior. Inventory changes can be assembled with their router mounting in T8 before final inventory tests.
- Completion: downstream owners have one consistent contract, permission matrix, persistence/event interface, and synthetic fixture shape. No downstream owner invents a fallback response.

### T2 — Implement chat persistence, membership rules, and domain invariants

Owner: Backend implementer. Dependencies: T1. Covers AC2–AC6, AC8–AC10.

Owned new files: `backend/src/domain/project-chat.ts`, `backend/src/domain/project-chat-membership.ts`, consolidated `backend/src/models/ProjectChat.ts` (seven models), and `backend/src/repositories/project-chat.ts`, `project-chat-memory.ts`, `project-chat-mongo.ts`. Primary owns any necessary edits to the existing repository interfaces/adapters and application index list.

- Implement the approved membership union using stable IDs, active role checks, current assignment precedence, canonical approved trade lineage, and explicit selection eligibility. Ignore historical sources once superseded; conflicting records must not grant extra access.
- Supply a source snapshot loader and pure resolver. Mongo and in-memory adapters must provide equivalent semantics; test-only fixtures cannot substitute weaker authorization.
- Add immutable message author/creation identity, priority/status/version invariants, explicit selection revocation metadata, monotonic sequences, and unique idempotency indexes. Do not embed unbounded messages inside Project records.
- Provide transaction-scoped writes for message/event/audit, participant selection/revocation, issue lifecycle, and read-state updates. Existing projects initialize state safely on first mutation, including concurrent first sends.
- Implement stable cursor pages, around-message retrieval, filtered issues/mentions, full-project summary counts, and membership-filtered conversation listing. Bound page sizes and query work; do not load every project's entire history to calculate a list.
- Use the existing authorization coordinator before authorization-sensitive transactions, then the project sequence/state allocation in a fixed order. The primary integrates matching source-writer fences in T4. Review lock contention and retries; do not weaken transactions to improve a test result.
- Completion: unit and memory/Mongo repository tests prove membership, index uniqueness, atomic rollback, ordering, idempotency, count correctness, and isolation across asymmetric projects.

### T3 — Implement chat REST behavior, participant controls, and issue lifecycle

Owner: Backend implementer. Dependencies: T2. Covers AC1–AC6, AC8–AC10.

Owned new files: `backend/src/services/project-chat.service.ts`, `backend/src/routes/project-chat.ts`, a narrowly scoped chat rate-limit middleware if needed, and focused chat domain/route/REST replica-set tests. Reuse existing audit infrastructure; primary owns app mounting and edits to shared audit registries.

- Implement all approved JSON endpoints with runtime validation, current actor/session/operation/membership checks, safe participant options, and per-action issue authorization.
- Bind sender identity to authentication, validate mention/owner/reply membership and same-project scope, and return the canonical saved record only after transaction commit.
- Normalize idempotent retries and payload-conflict handling; do not accept a cached original response after access has been revoked. Issue/participant retries must not duplicate audit history or decrement counts twice.
- Implement Normal/Important/Critical and Open/Resolved transitions, required reason/resolution notes, distinct issue ownership, historical actor attribution, and unavailable responsible-person states.
- Implement user-only monotonic read acknowledgements and server-derived unread/mention counts. Acknowledging a foreign/future message fails; a duplicated or older valid acknowledgement never moves backward.
- Add response/resource bounds, rate limits, no-store behavior, safe errors, and log metadata without conversation bodies or credentials.
- Completion: route/service tests exercise each permission-matrix row, selected membership without unrelated module access, removed/duplicate-name mentions, old history, stale versions, and atomic error/retry behavior.

### T4 — Coordinate membership changes with chat and invalidate stale access

Owner: Primary integrator. Dependencies: T1–T2; may run alongside T3 on disjoint files. Covers AC2–AC3, AC10–AC11.

Affected existing areas, limited to confirmed source transitions: `backend/src/services/project-workflow.service.ts`, `admin-project.service.ts`, `project.service.ts`, `auth.service.ts`, `access-request.service.ts`, `user-administration.service.ts`, `password-reset.service.ts`, `design-workflow-state.service.ts`, `estimate-decision.service.ts`, `estimate-project-handoff.ts`, `estimate-design-upload-deletion.ts`, applicable estimate lifecycle services, `backend/src/routes/estimates.ts`, and existing repository adapters. This list is an inspection/ownership boundary, not an instruction to edit every file.

- Add compatible coordinator calls only where absent and required by the source-transition inventory. Revalidate actor/session and membership within the transaction that commits a chat write, after obtaining the fence.
- Cover explicit/derived participant removal, changed role/session state, reassigned workers/designers, changed client linkage, and approval lineage changes. A completed assignment may remain a valid source; do not revoke solely because work finished.
- Trigger or expose durable membership invalidation after committed source changes. When one account/grant affects multiple conversations, use bounded affected-project discovery. Reconciliation is the correctness fallback; an in-process callback alone is insufficient.
- Preserve atomicity/idempotency of existing estimate/Design approvals, original task deadlines, and financial writes. Existing email delivery semantics remain unchanged.
- Add concurrent send/mention versus revoke/reassign/deactivate tests, including multi-source membership that remains valid after one source is removed. Test new and old sessions separately.
- Completion: every T0 mutation source has evidence that chat cannot commit through a completed revocation using a stale snapshot, and its current members/streams are refreshed safely.

### T5 — Implement durable live delivery and lifecycle management

Owner: Realtime implementer. Dependencies: T1–T2 interfaces; final integration depends on T3–T4. Covers AC7–AC10, AC12.

Owned files: new realtime services/routes listed in the ownership table, `backend/tests/project-chat-stream.test.ts`, `project-chat-stream.replica-set.test.ts`, `project-chat-cross-process.replica-set.test.ts`, and focused isolated-process helpers under `backend/tests/helpers/`. Primary owns `app.ts`, `server.ts`, configuration/CORS integration, and existing `server.test.ts`.

- Implement one process-level database change-stream dispatcher plus bounded durable-log reconciliation. Subscribe to committed project events, not request-process memory as the source of truth.
- Implement authenticated SSE with race-free snapshot/replay/live transition, monotonic project cursors, idempotent event consumption, bounded output buffering, and explicit resync/degraded states.
- Revalidate JWT expiry/session, current role/operation permission, and membership before payload batches and at approximately 15-second heartbeats. Stop/revoke streams without leaking project content in the error path.
- Keep private read events user-scoped. Preserve cursor progress for skipped/private events without broadcasting their content or identity.
- Implement fallback wakeups, change-stream resume/restart failures, disconnected consumers, write/backpressure handling, listener cleanup, and finite shutdown. Report lag/reconnect metadata safely.
- Use normal Authorization headers. Choose the approved cursor query parameter to avoid unnecessary CORS headers; configure no-store/no-transform, flushing, and allowlisted-origin handling through the primary integrator.
- Build the cross-process harness with two actual independent API processes and one disposable replica set. Include committed-write/process-exit before broadcast, another process's wakeup/replay, disabled change-stream wakeups, token invalidation, and snapshot/subscription races.
- Completion: real stream tests meet the local two-second normal-delivery target and prove eventual recovery with no lost or duplicate saved messages. Do not present mocked events as cross-process delivery evidence.

### T6 — Implement frontend API, stream parsing, and session-safe query state

Owner: Frontend implementer. Dependencies: T1; may run alongside T2. Covers AC4, AC6–AC10, AC12.

Owned new files under `frontend/src/features/messages/`: `projectChatApi.ts`, `projectChatKeys.ts`, `projectChatStream.ts`, `projectChatState.ts`, `ProjectChatProvider.tsx`, query/mutation hooks and focused tests. Primary owns the types contract and any edits to `frontend/src/api/client.ts`, `auth/AuthProvider.tsx`, or `components/layout/AppShell.tsx`.

- Consume the fixed API envelope/errors, authenticated URL/header helpers, and matching types without copying another token store or accepting tokens in URLs.
- Parse SSE frames correctly across split UTF-8 characters, split CRLF delimiters, comments, multiline data, and unexpected/malformed responses. Distinguish authorization loss from retryable network failure.
- Share one active project connection for the header and conversation. Reconnect with jitter/backoff, detect stale heartbeats, resync when requested, and catch up on visibility/network recovery.
- Merge optimistic/committed messages and replay events by ID/version. Invalidate all related filtered pages, summaries, issue lists, participant lists, and conversation list entries. A late response from another project/user/session must be discarded.
- Persist drafts only in session-scoped memory; retain drafts and failed attempts during ordinary navigation, then clear them on logout or project access removal. Same-attempt retry reuses the idempotency key.
- Coordinate acknowledgement with actual message visibility; backgrounded tabs and summary loads do not mark messages read. Do not skip unviewed newer messages when opening a filtered/quoted older view.
- Bound retained history/render state and clean up streams/timers/subscriptions under React StrictMode, navigation, project change, logout, and unmount.
- Completion: parser, reconnect, mutation/retry, unread, optimistic ordering, stale-session, and cache tests pass against contract-faithful fixtures.

### T7 — Build the reusable conversation, issues, and participant interfaces

Owner: Frontend implementer. Dependencies: T6. Covers AC1, AC3–AC6, AC9, AC12.

Owned new files under `frontend/src/features/messages/`: conversation/list pages, `ProjectChatHeader.tsx`, conversation timeline/message components, composer/mention combobox, issues panel/actions, participant list/management, and feature-local styles/tests. Reuse existing UI components rather than changing global primitives without a demonstrated integration need.

- Implement readable author/role/time rows, quoted replies with around-message navigation, priority labels, pending/failed/sent states, anchored older-message pagination, and respectful new-message scrolling.
- Implement `@` search/selection and editing semantics, accessible keyboard navigation, IME handling, desktop Enter/Shift+Enter behavior, and a mobile Send button. Duplicate names must remain distinct stable-ID targets.
- Implement the approved issue filters and lifecycle controls with server capabilities/versions, reason/resolution prompts, owner selection, actor/time history, and conflict recovery.
- Implement participant summaries and authorized selection/revocation with derived-source explanations, eligible-trade gaps, and the explicit shared-with-client notice. Never use hidden controls as authorization enforcement.
- Build the project-top `Critical N` and unread/mention indicators with loading/stale/unavailable handling; never turn missing backend data into zero.
- Implement desktop panel and mobile drawer behavior, keyboard/focus management, reduced motion, accessible color/labels, and all approved loading/empty/error/disconnected/removed-access states.
- Load the applicable UI-design skill during implementation; use browser QA skills when actually rendering. No image generation, 3D dependency, or unrelated visual redesign is needed for this conversation UI.
- Completion: rendered component tests demonstrate the workflows and accessible states across participating roles. Real browser responsive checks follow in T10.

### T8 — Integrate shared infrastructure and all role entry points

Owner: Primary integrator. Dependencies: T3–T7. Covers AC1, AC6–AC7, AC9–AC12.

Backend existing files: `app.ts`, `server.ts`, `models/application-indexes.ts`, necessary config/CORS and final OpenAPI/policy inventory wiring. Frontend existing files: `app/router.tsx`, `app/routeRegistry.ts`, session/shell/API integration, and role-specific screens/tests below.

| Existing surface | Required integration |
| --- | --- |
| `features/client/ClientProject.tsx` | Messages navigation and project-top critical summary, preserving client-safe project and document data. |
| `features/designer/ProjectWorkspace.tsx` | Messages navigation/header using the shared current-project connection. |
| `features/manager/ManagementProjectWorkspace.tsx` | Messages access only for actual membership; Design Head/global review visibility is not automatic group membership. |
| `features/admin/AdminProjectDetailPage.tsx` | Messages/header plus participant administration for assigned Sales Manager/Super Admin. |
| `features/procurement/ProcurementProjectPage.tsx`, `features/finance/FinanceProjectPage.tsx` | Shared chat entry/header where the user qualifies, preserving module-specific permissions. |
| `features/leads/LeadDetail.tsx`, `LeadEstimateWorkspace.tsx` | Project Messages entry only when the lead/estimate has a valid project link and the actor has membership. |
| `features/workflow/OperationalTaskQueue.tsx` | Messages link for qualifying project groups; no full-project/design permission granted to workers. |
| Route registry / application shell | Canonical `/projects/:projectId/messages` and `/project-messages` list route for every permitted role, including selected participants with no operational task/module page. |

- Mount the chat repository/services/routes consistently in test and Mongo runtime paths. Register indexes at the existing readiness boundary. Start/stop the dispatcher and close streams before HTTP shutdown waits indefinitely.
- Finalize authorization-policy version and all inventory fixtures; require active chat capability rather than general project access in navigation and direct-route guards.
- Integrate current-project provider ownership so overview and Messages share one subscription. Preserve in-memory drafts across navigation and clear session/private state at the existing auth boundary.
- For a role allowed to inspect project modules but not its chat, omit chat counts/content and avoid repeated denied fetches. For a chat-only participant, serve the safe chat header without calling protected design/finance endpoints.
- Verify deep links, back-navigation, participant-list entry with no tasks, and existing module state/scroll behavior. Keep unrelated layouts and business logic intact.
- Completion: every AC1 entry point reaches the same project conversation; backend/frontend contracts and the protected route registry agree on the integrated tree.

### T9 — Review integrity and resolve findings

Owner: `integrity_reviewer` in Mode A; primary integrator inline in Mode B. Dependencies: all writers finish T8. Covers all acceptance criteria, emphasizing AC2–AC3, AC6–AC11.

- Review the integrated diff for membership leaks, role-label joins, stale assignment precedence, manual-selection permission expansion, private read-event leakage, message/quote injection, and late-session cache writes.
- Review all relevant mutation fences, lock order, snapshot/replay gap handling, lost post-commit wakeups, idempotency collisions, count/cursor/read-state semantics, filtered-history behavior, unbounded resources, and cleanup.
- Verify no chat lifecycle action mutates immutable approval records, deadline/KPI calculations, task progress, or finance. Inspect scope and unrelated diffs.
- Report findings with precise affected paths and a regression scenario. Primary assigns fixes to the original owner with no overlapping edits; rerun relevant checks after fixes.
- Completion: no unresolved correctness/authorization issue remains. Review does not replace execution tests.

### T10 — Verify the integrated implementation and hand off

Owner: `verification_runner` in Mode A after review fixes; primary integrator inline in Mode B. Dependencies: T9. Covers AC1–AC12.

- Run the focused tests first, then required full backend/frontend checks on the integrated tree. Do not claim tests run during concurrent edits as final evidence.
- Execute the real two-browser-session/two-server-process scenarios, restart and degraded-stream recovery, assignment/deactivation races, and the responsive/accessibility matrix below.
- Record exact command, exit code/result, acceptance criteria, environment dependencies, and artifact path in the execution ledger. Redact secrets and use synthetic `.test` identities only.
- Preserve test data isolation; shut down test servers/replica sets and leave no production or developer database mutations. Any browser harness creates fixtures only in its disposable test database, never via project seed scripts.
- Inspect `git diff --check`, final changed paths, and all remaining diff. Report dependencies (expected: none), completed behavior, checks, unrun checks/limitations, and external actions not performed. Never call an incompletely verified transport or permission path complete.

## Safe parallel execution graph (Mode A only)

| Parent phase | Child work that may run together | Exit condition |
| --- | --- | --- |
| 1. Baseline and shared contracts | T0 bounded read-only audits; primary synthesizes T0/T1 | Fixed shared interfaces, source-transition inventory, and ownership. |
| 2. Feature construction | T2 with T6; then T3, T4, and T5 on disjoint paths; T7 follows T6 | All backend, source-coordination, realtime, and frontend slices finished. Respect at most three active children plus primary. |
| 3. Integration | T8, primary-owned; workers respond to bounded contract fixes only | Complete mounted/registered feature and role navigation. |
| 4. Review and verification | T9, then T10 sequentially | Findings resolved and integrated evidence recorded. |

T5 may begin against the ready T2 event/repository interfaces while T3 develops REST behavior, but its end-to-end tests wait for T3/T4/T8 integration. Existing shared files are not delegated merely to fill a slot. In Mode B follow the same dependencies inline; no implementation/review/verification subagents are spawned.

## Verification commands and scenarios

Planned new test filenames below are deliverables, not claims that tests already exist. If a test is split/renamed during implementation, update this plan's commands and traceability before final verification.

### Backend focused checks

Run from `backend/`:

```sh
npm test -- tests/project-chat.test.ts tests/project-chat-membership.test.ts tests/project-chat-repository.test.ts tests/project-chat-routes.test.ts
npm test -- tests/project-chat-mongo.replica-set.test.ts tests/project-chat-membership-mutations.replica-set.test.ts
npm test -- tests/project-chat-stream.test.ts tests/project-chat-stream-process.replica-set.test.ts
npm test -- tests/authorization-policy.test.ts tests/auth-authorization.test.ts tests/super-admin-authorization.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts
npm test -- tests/access-policy.test.ts tests/project-module-access.test.ts tests/access-request-mongo.replica-set.test.ts tests/project-workflow-routes.test.ts tests/project-workflow-mongo.replica-set.test.ts tests/admin-projects.test.ts tests/server.test.ts
```

Extend the focused regression lane with the relevant identity/password-reset/estimate lifecycle test when T4 touches that source. Use disposable Mongo replica sets; missing Mongo binaries or restricted loopback/network execution are environment blockers to fix through the normal tool approval mechanism, not reasons to skip transaction assertions or point tests at live Mongo.

### Frontend focused checks

Run from `frontend/`:

```sh
npm test -- src/features/messages
npm test -- src/api/client.test.ts src/api/authorization-contract.test.ts src/auth/authorization.test.ts src/auth/AuthProvider.test.tsx src/app/router.test.tsx src/components/layout/AppShell.test.tsx
npm test -- src/features/client/ClientProject.test.tsx src/features/designer/ProjectWorkspace.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/leads/LeadDetail.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx
```

### Integrated full checks

Run each command from both `backend/` and `frontend/`, sequentially per workspace after the final changes:

```sh
npm run typecheck
npm test
npm run build
```

At repository root:

```sh
git diff --check
git status --short
```

OCR checks are out of scope because no OCR sources or contracts change. No lint command exists, so no lint-passed claim is permitted.

### Browser and fault matrix

- Use synthetic projects A/B with different clients, assigned sales/design/site people, multiple same-role workers, a non-included trade, a non-member Design Head, and the sole Super Admin. Project A starts with three open critical/two important items; B has one critical item. Include history longer than one page and duplicate display names.
- In independent authenticated browser contexts, client A sends a Critical message mentioning a selected worker; worker receives without reload and replies with a quote/mention. A permitted manager resolves/reopens it and every open A project view updates; B counts and conversation remain isolated.
- Measure commit-to-render delay under normal local conditions, with sender/receiver on independent API processes. Disconnect the receiver, commit messages, restart a server, restore network, and confirm exact history/count recovery. Repeat with change-stream wakeups unavailable.
- Revoke an explicit participant, remove the last derived grant, reassign a worker, deactivate a user, and change a session version while a stream/send is active. Include a person retaining another valid membership source and verify they keep access.
- Check personal unread/mentions in visible and hidden tabs, filtered issue views, old quoted-message navigation, and multiple sessions of the same user. Check stale replies/mentions/owners when participant data changes mid-composition.
- Render widths 360, 390, 768, and 1440 pixels; simulate mobile keyboard/viewport changes and reduced motion. Verify tab/combobox/menu/dialog keyboard behavior, focus return, accessible labels/announcements, contrast, scrolling anchors, send failure/retry, loading/empty/error/unavailable states, and no horizontal overflow.
- Observe console/network failures, StrictMode connection leaks, slow-consumer handling, and listener/timer shutdown. Large-history checks must show bounded initial transfer/rendering and indexed server queries; record actual evidence without inventing a production concurrency guarantee.
- Keep QA outputs in an ignored or temporary location such as `/tmp/lisno-project-chat-qa/`. Record exact paths in the handoff; never commit screenshots, local database files, tokens, build outputs, or browser artifacts.

## Acceptance traceability

| Criteria | Implementation owners/tasks | Decisive final evidence |
| --- | --- | --- |
| AC1 | T0/T1/T3/T7/T8 | Every role entry point and safe chat-only deep link works; unrelated modules stay protected. |
| AC2–AC3 | T0/T2/T3/T4 | Two-project membership matrix, explicit-selection scope, current lineage, and source-removal races. |
| AC4 | T1/T3/T6/T7 | Unicode/mention/quote API validation plus keyboard/mobile/IME interaction. |
| AC5–AC6 | T2/T3/T6/T7/T8 | Permissioned lifecycle, concurrent/idempotent count correctness across all history, live project-top summary. |
| AC7–AC8 | T2/T3/T5/T6/T8 | Independent processes and browser sessions, measured normal latency, restart/reconnect/gap/replay/fallback recovery. |
| AC9 | T2/T3/T5/T6/T7 | User-private monotonic read state, actual-view acknowledgement, multi-session/filtered-view checks. |
| AC10 | T1/T2/T3/T4/T5/T6/T8 | Completed revocation blocks stale writes and new payloads; cached data/session streams are cleared. |
| AC11 | T1/T4/T8/T9 | Inventory/policy/regression/full checks and integrated invariant review. |
| AC12 | T5/T6/T7/T8/T10 | Responsive/accessibility matrix, bounded resources, failure states, and complete cleanup. |

## Core implementation execution ledger (historical)

Current parent phase: Local implementation and verification finished (T0–T10). Feature construction, role integration, independent review, automated regression checks and rendered browser checks are recorded below. Seven full-suite failures reproduce on unchanged HEAD; deployment-specific checks remain outside this local verification.

| Item | Status | Evidence |
| --- | --- | --- |
| Specification | Approved by user | Conversation approval on 2026-09-16; linked specification above. |
| Task plan | Approved by user | Conversation approval on 2026-09-16. |
| Execution mode | A — parallel sub-agents | Selected by user on 2026-09-16. |
| T0/T1 | Baseline audited; contracts established | Initial dirty set: approved untracked spec/plan only. Stable DTO/service boundary and chat operation permissions added. |
| T2/T3 | Implemented | backend_chat implemented domain/membership, seven consolidated models, memory/Mongo adapters, service, REST and focused tests. |
| T4 | Implemented and reviewed | Existing source writes use the shared authorization fence; regression fixtures preserve transaction semantics. |
| T5 | Implemented and tested | Primary implemented realtime after the native child-thread limit prevented a separate realtime worker. Six transport tests pass, including two actual Node API processes and disposable Mongo. |
| T6/T7 | Implemented and locally verified | New messages feature, review fixes, 44 focused tests, and actual two-session browser verification completed. |
| T8–T10 | Integrated; local review and verification recorded | Protected inventory, role entry points, stream shutdown, API contracts and session isolation reviewed. Final builds, test results, baseline failures, responsive browser evidence and limitations are recorded below. |
| Dependencies / lockfiles | Unchanged | No additions. |
| Deployment / data migration / external messaging | Not performed | Outside the authorized local implementation scope. |

All development gates have been satisfied. The approved local implementation has been delivered; no deployment or external mutation is authorized or performed.

### Confirmed source coordination inventory

- Existing fenced paths: account role/active changes, password reset completion, access-grant approve/revoke, admin initiation, invitation acceptance, design workflow actions. Chat writes reuse that global authorization fence and recheck verified sessionVersion/expiry within their transaction.
- Add missing fences to current estimate edit/submit/reviewer assignment/decision/publication and client approval transactions; designer and worker/section assignment transactions; final Design approval callers. Client signup/project creation use authorization-before-email lock ordering.
- Do not treat direct_assignment grants or broad Site Manager/Design Head visibility as chat membership. Existing authorized access_request role/module pairs are authoritative.
- Current plan designer eligibility is stable through assigned/in_progress/ready_for_client/changes_requested stages; upload lifecycle status changes alone do not change membership. Historical estimate reviewer IDs must not reappear once superseded.
- PublicUser omits JWT claims; ChatActor separately carries verified sessionVersion/expiry for transaction-bound revalidation.
- Frontend uses persistent AppShell provider; safeReturnPath must admit only the exact list and canonical messages patterns. Worker queues include flat cards, so project links must cover those as well as Site Manager groups.


### Integrated review findings and decisions

- Native worker/thread capacity required the primary to implement the realtime slice; the existing independent read-only auditor performed successive backend and frontend integrity passes. Work remained partitioned by files.
- Final SSE enqueue rechecks actor/session/current membership under the same authorization coordinator as source changes. Enqueue is synchronous; network drain occurs outside the transaction. SSE event IDs make transaction retries harmless. Tests cover a prepared batch denied after revocation, initial-frame backpressure, a drain during commit, and bounded shutdown.
- Fixed read acknowledgement to PUT, separated resource/action errors from authoritative conversation-access denial, refreshed open issue dialogs after filtered items disappear, and added foreground list reconciliation.
- Access restoration requires a fresh successful summary response for the unchanged mounted session. Failed retries keep access denied; successful regrant clears only that project's denial and starts one stream, without restoring revoked drafts or cached content. The final independent review found no stale-session or cache-restoration leak.
- Participant fingerprints include eligibility/capability inputs as well as people, so approved-trade availability changes reconcile even before a worker is selected.
- Conversation counts are computed only for the returned page. Super Admin uses a lightweight metadata aggregation before source/count hydration. Non-global exact totals still require resolving current membership across that user's candidate projects; no persistent membership projection or migration was introduced.
- Every new backend route is registered in the protected operation/OpenAPI inventory; backend/frontend publish the same 128-permission chat policy. The manifest contains 198 human JWT operations and OpenAPI contains 211 total operations.
- No dependency or lockfile changes. No deployment, production writes, migration, seed script, commit, push, email or external messaging was performed. Runtime verification uses disposable synthetic `.test` users and replica sets only.

### Baseline regression evidence

- The backend full suite retains three failures in `tests/full-journey.test.ts`: extra design workflow stages in a legacy exact-shape assertion, an obsolete stage-upload expectation, and an OCR fixture's detected-title expectation. All three reproduce on unchanged HEAD copied to `/tmp/lisno-chat-head-baseline-20260916/backend`; evidence: `/tmp/lisno-chat-head-full-journey.log`.
- A full-run bootstrap cleanup test hit its 5-second timeout under concurrent load; it passed all 11 tests in a focused rerun (`/tmp/lisno-chat-bootstrap-recheck.log`) and in the initial full run. No bootstrap product code was changed.
- The frontend retains four failures also reproduced on unchanged HEAD: signup Address-label expectation, password-reset input clearing, access-request drawer focus, and legacy estimator margin pending-state expectation. Evidence: `/tmp/lisno-chat-head-frontend.log` and `/tmp/lisno-chat-frontend-regressions.log`.
- Historical inventory assertions were updated to include the actual current workflow routes plus chat. No unrelated product behavior was changed to satisfy old tests.


### Final automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Backend `npm run typecheck` and `npm run build` | Passed on final backend sources | `/tmp/lisno-chat-backend-final-build.log`; primary also independently reran both. |
| Backend eight `project-chat` suites (`npm test -- <eight files> --maxWorkers=3`) | 44/44 passed, including disposable Mongo and real-process SSE | `/tmp/lisno-chat-final-focused.log`. |
| Backend full `npm test -- --maxWorkers=3` | 2,877 passed; three unchanged-HEAD failures; 138/139 files passed | `/tmp/lisno-chat-backend-final-summary.log`; the earlier bootstrap timeout passed in this final full run. |
| Backend API documentation/server/operation inventory | 76/76 passed | `/tmp/lisno-chat-backend-shared-final.log`. |
| Frontend shared API/policy/safe-return checks | 139/139 passed | `/tmp/lisno-chat-frontend-shared.log`. |
| Frontend full `npm test -- --maxWorkers=3` | 2,719 passed; four unchanged-HEAD failures; 190/194 files passed | `/tmp/lisno-chat-frontend-final-summary.log`. |
| Frontend `npm test -- src/features/messages` after final access-restoration fix | 44/44 passed across five files | Final primary test run: 2026-09-16, 2.44 seconds. Includes failed access retry, successful regrant without reload, erased revoked draft, and one restored stream. |
| Frontend `npm run typecheck` and `npm run build` after final access-restoration fix | Passed | Final primary run: Vite built 2,253 modules in 5.83 seconds. Existing large-bundle advisory remains; no dependency was added. |
| Repository hygiene | `git diff --check` passed; no dependency/lockfile changes | Initial application worktree was clean; all resulting paths belong to the approved feature or its regression fixtures. |

The frontend full run preceded the last bounded access-restoration interaction; its focused regression lane, typecheck and build were rerun after that change. No OCR source or worker contract changed; OCR worker tests and production/proxy load validation were not run. There is no lint script.

### Rendered browser verification

- The isolated runtime uses a disposable Mongo replica set and two independent Node API processes. Two Vite origins load the actual AuthProvider, ProjectChatProvider and chat screens with separate synthetic client/worker sessions. Only auth bootstrap is supplied by the local harness; chat REST and SSE are real.
- Project A contains 45 historical messages, including three Critical and two Important items; project B contains a different client and one Critical item. Fixtures include unrelated same-role workers and a non-included trade.
- Two independent Playwright browser sessions confirmed that a client-created Critical message with an Electrician mention arrives on the worker's page through the second API process without reload. Worker count changed from 3 to 4. Recorded acknowledgement-to-render latency was 120 ms; the POST response took 42.3 ms. This is a local acceptance observation, not a production latency guarantee.
- The worker replied with an explicit Client mention and a quote of the original message. The client received the reply 120 ms after acknowledgement. Resolving the discussion with a required note used the real PATCH endpoint, changed both sessions from Critical 4 back to Critical 3, and displayed the resolved state without reload. Each session retained one navigation entry. Closing the issue dialog returned focus to its trigger.
- The longer CLI script lost its browser socket session before running. Ordinary snapshot/fill/click commands in two named sessions worked; browser verification continued through those commands. CUA was unavailable in this environment. Neither tooling issue required product changes.
- At 1440, 768, 390 and 360 px, document horizontal overflow was false. The corresponding composer widths were 1082, 672.92, 329 and 299 px. The focused composer and Send action remained usable in a 360 × 460 viewport simulating reduced space from a mobile keyboard.
- The mobile participants drawer closed with Escape and returned focus to its trigger. Mention selection worked using Enter. Both independent browser consoles reported zero errors and zero warnings; observed client API responses contained no error statuses.
- All six screenshots were visually inspected by the frontend agent; the primary independently inspected desktop, narrow mobile and keyboard-height screenshots. Evidence: `/tmp/lisno-project-chat-qa/browser-results.json`, `real-1440.png`, `real-768.png`, `real-390.png`, `real-360.png`, `real-mobile-participants.png`, and `real-mobile-keyboard.png` in the same directory.
- Browser evidence uses the actual project-content components in an isolated shell. Full browser contrast auditing and reduced-motion emulation were not run; focused rendered accessibility tests passed, and the feature stylesheet explicitly disables transitions/smooth scrolling under reduced motion. Actual mobile operating-system keyboard behavior and production proxies/concurrency were not measured.
- Cleanup completed: owned Playwright sessions and both Vite servers closed; the disposable runtime exited successfully after closing its two APIs and Mongo replica set. Temporary runtime credentials were deleted. Only non-secret test evidence and harness sources remain under `/tmp`; no runtime files were added to the repository.

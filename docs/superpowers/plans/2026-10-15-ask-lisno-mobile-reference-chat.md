# Ask Lisno mobile reference chat task plan

Source of truth: [Approved conversation design](../specs/2026-10-15-ask-lisno-mobile-reference-chat-design.md).

## Status and authority
Specification and task plan approved on 2026-10-15; user selected Mode A. Implementation is delivered with available verification completed and temporary preview settings restored. Native full soft-keyboard resizing, actual native Back dispatch and iOS device checks remain explicitly unverified.

Task 1 complete: dirty-path set, target diffs and copies captured under `/tmp/lisno-ask-chat-reference-qa/`. Internal interface: each turn has stable `createdAt` and optional `errorKind` from `busy | usage_limit | timeout | invalid_answer | paused | unavailable`. The UI captures welcome time once. `useScaffoldContentBack()` exposes the existing Back registration; `presentation="conversation"` opts this route into a full-screen scaffold which owns all safe-area insets.

Tasks 2–5 complete: state, presentation and route/scaffold changes integrated. Independent integrity review found no unresolved defects; follow-up review identified an empty-input font-scale issue that was fixed and re-reviewed. Visual QA also prompted explicit multiline composer growth and a darker timestamp color. Final focused regression run passed 16 suites and 299 tests. Tasks 6–7 concluded with the verification limits recorded below. The synthetic web matrix passed at five widths with 44px targets, no page overflow, manual retry retaining identity/time, safe failure states, contextual team routing, project clarification/paging and verified financial display. Additional rendered checks passed for reading-position retention on a late response, explicit-send following, list retry/refresh, denied-state cleanup and access retry.

File/photo controls are explicitly disabled with “Not available yet” hints. Preserve the floating Projects launcher, existing private conversation API, authorization, session isolation, project context and verified financial presentation. No backend/provider changes, new uploads, billing changes, dependencies, commits, deployment or production writes.

## Ownership and implementation contract
The primary agent owns integration, the route and shared scaffold, cross-file contracts, the durable documents and final reconciliation. Capture all existing dirty changes before assigning writers. In Mode A, the state and presentation slices below can run independently only after their internal interface is settled. In Mode B, the primary agent performs every task sequentially without subagents.

Internal contract to settle in task 1:
- Preserve `AskLisnoEntry`, `AskLisnoWorkspace({ session, initialProjectId? })` and the existing hook actions. The launcher appearance and behavior stay unchanged.
- Give each new question one local ISO creation timestamp; retry reuses the same turn ID and timestamp. Capture the welcome timestamp once per mounted conversation. Response verification time remains the server's `checkedAt`.
- Represent error-card classification with a small application-owned allowlist for busy, usage limit, timeout, invalid answer, paused and unavailable states. Retain sanitized helper text; never put raw exceptions or provider text into presentation state. Keep project-list errors compatible with their existing retry flow.
- Derive sending, failed and answered indicators from the real request/response state. No new delivery/read-receipt semantics or API fields.
- Provide the assistant header access to the established guarded Back action through the scaffold's content interface. Use one explicit opt-in full-screen presentation for Ask Lisno; default scaffold behavior remains unchanged.
- Assign a single owner for safe-area insets and coordinate keyboard avoidance with the header/composer, avoiding duplicated padding or duplicate Back registration.

## Dependency-ordered tasks

### 1. Protect the baseline and settle interfaces
Owner: primary agent. Dependencies: task-plan approval and execution-mode selection.

- Capture `git status --short`, targeted diffs and temporary copies of the untracked Ask Lisno files. Review existing route/scaffold edits and preserve them.
- Trace the current route, Back fallback, permission checks, draft/retry lifecycle, icon assets and rich-answer rendering. Reuse the existing botanical artwork and SVG infrastructure.
- Freeze the internal metadata, failure classification and header-Back interfaces above before delegation. Declare exact new component filenames and ownership to prevent overlap.
- Establish a deterministic synthetic visual fixture corresponding to the reference: greeting, a short user message and a real simulated failure. Keep fixture-only names and clock values outside production behavior.

Acceptance: all writers share the approved visual direction, stable interfaces and protected dirty-file baseline. Trace: AC1–AC7.

### 2. Add truthful conversation presentation metadata
Owner: state implementer in Mode A; primary agent in Mode B.
Files: `mobile/src/features/ask-lisno/useAskLisno.ts`, `askLisnoApi.ts`, `askLisnoApi.test.ts`, and a focused hook/presentation helper or test only if justified. No workspace, style, answer-renderer or shared navigation edits. Dependency: task 1.

- Add stable creation timestamps without changing request payloads or persisting private history. Preserve times across manual retry, project clarification and list paging.
- Supply safe failure classification for compact error cards. Usage-limit wording must say to retry later; do not invent a reset time or add automatic retries.
- Preserve one-request-at-a-time behavior, retained failed questions, cancellation, denied-access cleanup and session/environment fences. Honor the scaffold navigation block for send/quick-action activation at the UI integration boundary.
- Add focused regressions for stable retry identity/time, error classification and unchanged text-only API input. Retain existing tests for contextual IDs and financial-response validation.

Acceptance: truthful metadata and failure states, unchanged private request contract. Trace: AC2, AC3, AC4, AC5.

### 3. Build the reference conversation presentation
Owner: presentation implementer in Mode A; primary agent in Mode B.
Files: `mobile/src/features/ask-lisno/AskLisnoWorkspace.tsx`, `AskLisnoAnswer.tsx`, `askLisnoStyles.ts`, `AskLisnoWorkspace.test.tsx`, and scoped header/message/composer/icon components declared in task 1. No state/API or shared scaffold edits. Dependency: task 1; consume task 2's frozen interface and task 4's Back interface.

- Introduce scoped reference colors, native system typography, spacing and bubble dimensions. Reuse gold botanical artwork and line icons without touching global tokens or installing dependencies.
- Render the fixed Back/logo/title header, greeting with the current first name, avatar-led assistant bubbles, right-aligned sage user bubbles and truthful timestamps/status.
- Preserve all existing verified answer content, source labels, project selection/list paging and monetary presentation within the new bubble system.
- Replace separate error text and wide retry action with one compact alert card. Retain access-check retry, loading, denied and list-error states.
- Build the bottom quick-action row with My projects, Project progress and Expected costs, followed by the authorized Message your team action. Preserve contextual routing and backend project clarification.
- Build the multiline bottom composer, disabled file/photo controls with visible/accessible unavailable explanation, and a 44px-minimum send target around the green circular icon.
- Keep the transcript flexible and scrollable; follow new content only near the bottom or after the user's send action. Preserve reading position when inspecting earlier messages.
- Update component tests for all changed accessible names, control states, message/error layout, reference prompts, disabled attachment behavior, real status and retained rich-answer behavior. Keep the existing floating launcher tests intact.

Acceptance: complete reference-like flow with real behavior and accessible controls. Trace: AC1–AC6.

### 4. Integrate the dedicated chat route and guarded Back
Owner: primary agent.
Files: `mobile/src/app/feature/[featureId].tsx`, `mobile/src/navigation/AdaptiveAppScaffold.tsx`, `AdaptiveAppScaffold.ui.test.tsx`, and focused existing Back/navigation tests when needed. Edit `scaffoldLayout.ts` or its existing test consumer only if required for the explicit presentation mode. No changes to global role navigation or the Projects launcher. Dependency: task 1.

- Opt the Ask Lisno route into full-screen conversation presentation at all widths, hiding only its ordinary top bar, duplicate Back row, dock and rail.
- Keep session authorization, scaffold guard providers, status-bar treatment and Back fallback active. Connect the custom header to the existing guarded Back action.
- Apply safe areas once and ensure the conversation consumes the available height, including keyboard open/closed states and tablet/landscape widths.
- Add regression coverage proving the Ask Lisno chrome behavior and unchanged ordinary Client, staff and Procurement scaffold behavior. Check direct-entry fallback and no duplicate Back dispatch.

Acceptance: one chat header, correct safe areas and navigation, no unrelated shell regressions. Trace: AC1, AC5, AC6.

### 5. Integrate and review the complete result
Owner: primary agent; `integrity_reviewer` in Mode A. Dependencies: tasks 2–4 completed; all writers stopped.

- Reconcile the final interfaces and inspect every scoped diff against the captured baseline. Fix confirmed findings before final verification.
- Review permission/session boundaries, retry identity, timestamp truthfulness, paused and late responses, financial/source rendering, guarded Back, scroll-follow behavior, disabled uploads and safe-area/keyboard ownership.
- Confirm no private upload, provider quota workaround, implicit team message, fabricated receipt or extra API mutation was introduced.
- In Mode A, run the independent integrity review after integration and then pass the settled result to the verification runner. In Mode B, perform equivalent review inline.

Acceptance: no unresolved correctness or integration findings. Trace: AC2–AC7.

### 6. Run final checks and compare rendered screens
Owner: `verification_runner` plus primary visual verification in Mode A; primary agent in Mode B. Dependency: task 5.

From `mobile/`, run:

```sh
npm test -- --runInBand src/features/ask-lisno src/navigation src/features/projects/ProjectsWorkspace.test.tsx
npm run typecheck
npm run export:android
```

From the repository root, run `git diff --check` and `git status --short`.

Rendered verification:
- Compare synthetic reference-like content at 390 × 648 logical pixels to the attached image. Review images directly for logo size, header position, bubble proportions, typography/wrapping, avatar alignment, compact error card, chips, composer and whitespace.
- Check 320px narrow phone, 390px taller phone, 844 × 390 landscape and 768 × 1024 tablet layouts. Include larger font scale and long content; no clipped controls or horizontal page overflow.
- Exercise welcome, sending, success, usage-limit failure/retry, timeout, denied/access-check failure, long conversation, clarification and paginated project-list states.
- Check keyboard opening/dismissal, growing input, latest-message visibility, preserved older-message scroll position, empty/busy/blocked send, disabled file/photo controls, quick actions and authorized team navigation.
- Check header Back, Android system Back and direct-entry fallback, plus the Projects launcher and representative unchanged scaffold routes.
- Use native Android rendering when available and synthetic account/project data for screenshots. An isolated React Native Web harness may supplement the size/state matrix; clearly identify mocked scaffold/router behavior. Do not send live AI requests merely to obtain error screenshots while provider quota is exhausted.
- Verify accessible names, disabled/busy states, minimum touch targets, readable text contrast and useful status announcements. Report iOS/device checks as unrun if unavailable.

Run final checks on the integrated worktree, not concurrently changing sources. Repeat only checks affected by later fixes. No lint claim: the repository has no lint script.

Acceptance: AC1–AC7 supported by exact commands, interaction evidence and visual review, with limitations stated.

### 7. Record completion and clean task-owned temporary effects
Owner: primary agent. Dependency: task 6.

- Update this plan with actual results, affected files and visual artifact paths. Report provider quota as an external limitation distinct from UI correctness.
- Keep QA artifacts under a dedicated ignored temporary directory such as `/tmp/lisno-ask-chat-reference-qa/`; Android export stays in ignored `mobile/dist/android`.
- Stop task-owned preview servers and browser sessions. Restore any emulator size/orientation overrides and any tracked build log proven clean before this task; preserve all pre-existing dirty content.
- Report the implementation outcome, principal design/architecture decisions, exact checks and results, unrun checks and remaining risks. Do not claim verification that was unavailable.

## Parallel execution graph
Task 1 precedes all writers. Tasks 2, 3 and 4 may run in parallel in Mode A because state/API, presentation and shared navigation paths have distinct owners and their interfaces are frozen first. Tasks 5, 6 and 7 are sequential integration, review, verification and handoff stages. Keep one parent task in progress. Each agent must be told it is sharing the worktree, must preserve other edits and must report interface changes to the primary agent before crossing ownership boundaries.

Mode B executes the same dependency graph inline without subagents. Do not begin either mode until the task plan is approved and the execution-choice gate is completed.

## Implementation and verification record

Changed native feature files: `AskLisnoWorkspace.tsx`, `AskLisnoAnswer.tsx`, `askLisnoStyles.ts`, `useAskLisno.ts`, `askLisnoApi.ts`, `askLisnoApi.test.ts`, `AskLisnoWorkspace.test.tsx`; added `AskLisnoHeader.tsx`, `AskLisnoMessage.tsx`, `AskLisnoComposer.tsx`, `AskLisnoIcons.tsx`, `useAskLisno.test.tsx`, all under `mobile/src/features/ask-lisno/`.

Shared integration: `mobile/src/app/feature/[featureId].tsx`, `mobile/src/navigation/AdaptiveAppScaffold.tsx`, `AdaptiveAppScaffold.ui.test.tsx`, and `backNavigationPolicy.test.ts`. Existing Projects launcher files and pre-existing unrelated work were preserved. No dependency, API, persistence, provider or billing changes.

Final integrated checks, after the multiline and scaled-input fixes:

| Check | Result |
| --- | --- |
| `cd mobile && npm test -- --runInBand src/features/ask-lisno src/navigation src/features/projects/ProjectsWorkspace.test.tsx` | Passed: 16 suites, 299 tests |
| `cd mobile && npm run typecheck` | Passed |
| `cd mobile && npm run export:android` | Passed: 42 assets and one Android bundle |
| `git diff --check` | Passed |
| `git status --short` | Reviewed; unrelated dirty work preserved |

The initial final test run exposed a normal-font test fixture using Jest's default 2× font scale; the fixture now explicitly uses 1×, while a separate regression verifies 1.5×. The entire focused set passed after that correction. The export's only warning concerned simultaneous `NO_COLOR` and `FORCE_COLOR` environment flags. The generated tracked export log was restored to its exact captured baseline; initially dirty router types were preserved.

Evidence: `/tmp/lisno-ask-chat-reference-qa/verification/final-*`, `/tmp/lisno-ask-chat-reference-qa/visual/RESULTS.md`, and screenshot artifacts under `/tmp/lisno-ask-chat-reference-qa/visual/output/playwright/`. Android output remains ignored at `mobile/dist/android`.

Native Android synthetic checks confirmed the existing gold artwork, multiline input growth from about 28dp to 100dp, a visible 44dp Send target, readable 1.5× text including the 42dp empty composer, and the usage-limit error/Retry state without a false Answered receipt. Detailed evidence is at `/tmp/lisno-ask-chat-reference-qa/visual/NATIVE-RESULTS.md`. The emulator exposed a floating keyboard toolbar, so full soft-keyboard resizing remains unverified; native Back dispatch was not asserted in this harness. Back policy/guard regressions and the browser callback check passed. iOS device/keyboard verification remains unrun.

Cleanup verified: exact original native debug-preference bytes restored; font scale restored to 1.0 and hardware-keyboard IME setting to 0; task-owned Metro8092, Vite4208 and preview browser sessions stopped. Existing Metro8081 was untouched. No emulator size, density, orientation or reverse-forward settings were changed.

Unrun/out of scope: full mobile/backend/frontend/OCR suites, live AI quota check, iOS device tests. There is no lint script. No migration, seed, deployment, commit, push or production mutation was performed. Provider quota exhaustion is unchanged by this presentation work.

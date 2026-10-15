# Ask Lisno mobile chatbot launcher task plan

Specification: [Approved mobile chatbot launcher spec](../specs/2026-10-15-ask-lisno-mobile-icon-design.md)

## Status and boundaries
Specification and task plan approved on 2026-10-15; user selected Mode A. Tasks 1–4 are complete. Integrated automated checks, native Android interaction/layout checks and synthetic screenshot review passed.

This is a bounded native mobile presentation change. Preserve the existing assistant route, optional stable project context, Client capability checks, navigation guard, conversation behavior, More destination and navigation dock. No dependencies, backend changes, commits, deployment or production mutations are included.

## Dependency-ordered tasks

### 1. Capture the current baseline
Owner: primary agent. Dependencies: task-plan approval and execution-mode selection.

- Capture the current dirty-path set and per-target diff. Save a temporary baseline of the untracked Ask Lisno files before editing them.
- Recheck all entry consumers, the Projects viewport, and scaffold safe-area/dock layout. Preserve existing unrelated edits.
- Confirm the change remains limited to the five files owned below; add a file only if a concrete integration requirement emerges within the approved scope.

Acceptance: existing work is understood and protected before writers start.

### 2. Convert the entry into an accessible icon button
Owner: launcher implementer, or primary agent in Mode B.
Files: `mobile/src/features/ask-lisno/AskLisnoWorkspace.tsx`, `askLisnoStyles.ts`, and `AskLisnoWorkspace.test.tsx` in that directory. Dependency: task 1.

- Replace the entry's image/title/description row with a decorative speech-bubble/chatbot SVG inside a 56px circular olive button. Reuse existing SVG support and color tokens.
- Keep its accessible name and hint, disabled semantics, guarded navigation and optional encoded project ID. Add a simple pressed color without animation or shadow.
- Keep viewport placement in the parent workspace so the entry remains reusable; do not alter conversation styles or logic.
- Extend the existing entry regression to cover icon-only content and retain navigation/context, blocked-navigation and role checks.

Acceptance: AC1, AC3, AC4.

### 3. Place the launcher outside the scrolling Projects list
Owner: Projects implementer, or primary agent in Mode B.
Files: `mobile/src/features/projects/ProjectsWorkspace.tsx` and `ProjectsWorkspace.test.tsx`. Dependency: task 1; uses the unchanged `AskLisnoEntry({ session, projectId? })` interface from task 2.

- Remove the entry from the list header and render it as a sibling within a flex viewport wrapper.
- Position the launcher at the lower-right with 16px clearance, within scaffold safe-area boundaries and above the dock. Avoid a full-screen touch-intercepting overlay.
- Reserve list-end clearance only when the current session can use Ask Lisno, so the final item and pagination action can scroll above the launcher.
- Extend existing Client visibility/navigation coverage to verify a single entry outside the list, no card copy, and preserved list/filter/pagination interaction.

Acceptance: AC1, AC2, AC3, AC4.

### 4. Integrate, review and verify
Owner: primary agent. Dependencies: tasks 2 and 3 completed.

- Review the integrated diff for authorization/guard preservation, touch handling, safe areas, layout sizing and unrelated changes.
- Run from `mobile/`: `npm test -- --runInBand src/features/ask-lisno/AskLisnoWorkspace.test.tsx src/features/projects/ProjectsWorkspace.test.tsx`.
- Run from `mobile/`: `npm run typecheck` and `npm run export:android`.
- Render with synthetic Client data at narrow phone (320px), standard phone (390px), landscape (844 × 390), and tablet (768px) sizes where supported. Check scroll anchoring, dock clearance, final-row/pagination access, the accessible button name, tap-to-open and Back. Include empty/loading/error list states and denied/blocked launcher behavior in the appropriate rendered or component checks.
- Prefer an available native emulator/device for the tap/Back flow. If unavailable, use the mobile web renderer for layout checks and state the native verification limitation explicitly.
- Run `git diff --check` and inspect final status. Report exact checks, results and any unrelated baseline failures. Keep temporary QA/build output ignored and report its path.

Acceptance: AC1–AC5, with any unavailable device checks explicitly disclosed.

## Parallelism and ownership
In Mode A, tasks 2 and 3 may run in parallel after task 1 because their files do not overlap and the entry interface stays unchanged. Each writer must preserve existing dirty changes and avoid the other writer's paths. The primary agent owns integration and final verification after both writers finish. Review remains proportional to this small change.

In Mode B, the primary agent performs all tasks sequentially without subagents. Only one parent task is in progress at a time. No work begins before the execution-choice gate is completed.

## Completion evidence
The handoff will link the affected files, summarize the resulting icon behavior, list actual checks and limitations, confirm no dependencies were added, and identify any remaining visual or device verification gaps.

## Verification evidence
- Integrated focused test command above: 2 suites, 33 tests passed.
- `npm run typecheck`: passed.
- `npm run export:android`: passed; ignored bundle output is `mobile/dist/android`. The generated tracked export log was restored to its initially clean state.
- `git diff --check`: passed repository-wide.
- Native Android emulator: tap opens the existing assistant; system Back returns to Projects; the launcher remains fixed after list scrolling and wide-card text is absent.
- Native sizes approximately 320 × 720, 390 × 844, 844 × 390, and 768 × 1024 logical pixels: exactly one 56 × 56 button, 16px right clearance and safe bottom clearance above dock/system navigation. Original emulator dimensions restored after QA.
- Synthetic React Native Web screenshots at the same four sizes: actual Projects/launcher components retain a constant 56px target and 16px viewport insets while scrolling. Pagination is clickable and ends 32px above the launcher. Primary agent visually reviewed standard phone, narrow phone at list end, and landscape at list end.
- Browser screenshots use synthetic projects and an explicitly emulated scaffold; actual safe areas, dock/rail layout and navigation were checked separately on Android. Browser-only SVG adapter warnings and a missing preview favicon do not establish native runtime errors. No browser page exceptions occurred.
- Synthetic visual artifacts: `/tmp/lisno-ask-icon-qa/visual/output/playwright/`. This harness adds no repository source or dependency changes.
- Synthetic empty/loading/error/denied/blocked/unauthorized states, filtering, assistant-route activation and dock interaction passed. Detailed report: `/tmp/lisno-ask-icon-qa/visual/RESULTS.md`. Dedicated preview server and browser session stopped.
- Baseline, verification logs and sanitized native geometric evidence: `/tmp/lisno-ask-icon-qa/`. Native QA retained no account details, client content or screenshots. No chat questions were submitted.
- No dependencies, backend edits, migrations, commits, deployment or production writes. iOS device checks and full suites are outside this focused verification lane.

# Ask Lisno reference redesign: task plan

Date: 2026-10-11
Status: Specification and task plan approved by the user; Mode A selected. T1–T6 completed and locally verified on 2026-10-11.

Source of truth: [approved redesign specification](../specs/2026-10-11-ask-lisno-reference-redesign-design.md). Its approval is recorded here without changing its approved contents at the task-plan gate.

## Outcome and boundaries

Implement the supplied reference's sage header, rounded bubbles, Lisno avatars, inset project summary, persistent quick prompts, and integrated composer in the existing private Ask Lisno window. Preserve current permissions, request contracts, project resolution, access revalidation, retries, cancellation, and customer-facing answer details.

Use existing verified data. Do not add attachments, ratings, provider-online claims, read receipts, sample project metrics, or stock project photographs. No backend, database, scheduler, provider, shared Project Messages redesign, dependency, deployment, or commit work is included.

Initial dirty-path set at this planning gate: only the untracked approved specification. No application files were modified. Re-capture status and relevant per-target diffs before implementation; preserve any intervening work.

## Dependency order and ownership

The parent implementation task is the Ask Lisno redesign. Keep one parent task in progress; T2 and T3 may be parallel subtasks after T1 settles the component/selector contract. Ownership below applies only after execution-mode selection. Mode B performs the same work inline.

| Task | Mode A owner | Owned paths/responsibility | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| T1: Baseline and presentation contract | Primary | Read-only inspection, this plan, component/selector agreements | Approved plan and execution choice | AC1–7 |
| T2: Bounded presentation components | Frontend implementer | New `AskLisnoProjectCard.tsx`, `AskLisnoQuickPrompts.tsx`, and their colocated tests under `frontend/src/features/ask-lisno/` | T1 | AC1–5 |
| T3: Scoped reference styling | Frontend implementer | `frontend/src/features/ask-lisno/askLisno.css` only | T1 | AC1, AC5–6 |
| T4: Panel integration and lifecycle | Primary | `AskLisnoPanel.tsx`, `frontend/src/features/estimates/AskLisnoLauncher.tsx`, `AskLisnoLauncher.test.tsx` | T1; final integration requires T2/T3 | AC2–5 |
| T5: Integrity review and visual refinement | Primary plus integrity reviewer | Read-only integrated review; fixes returned to owning writer | T2–T4 finished | AC1–6 |
| T6: Final verification and handoff | Verification runner, primary | Exact checks, browser evidence, plan result record; no independent product edits | T5 cleared and writers stopped | AC1–7 |

In Mode A, explicitly tell every writer that others share the worktree and that unrelated edits must be preserved. No worker edits another owner's files. Primary owns interpretation, existing request/state logic, and all integration decisions. Existing API types, shared answer components, logo assets, global tokens, and overlay infrastructure remain read-only unless a verified in-scope defect requires a coordinated reassignment.

## T1. Capture baseline and freeze the component contract

- Re-read the current panel, launcher, shared answer renderer, API shapes, applicable styles, and focused tests. Capture current normal/mobile appearance with synthetic authorized data before editing when browser tooling is available.
- Record the supplied image's hierarchy and spacing in practical panel dimensions: approximately 480 px wide, up to 700 px tall, within viewport limits. Use the approved local palette, existing Poppins, and existing Lisno mark.
- Freeze the private component props and CSS selectors before concurrent writers start:
  - Project card consumes the existing response's resolved project identity and returned facts; it performs no network request. Render only for an eligible resolved status answer with matching project identity. Show supported stage/status facts with no inferred metrics.
  - Quick prompts receive a disabled state and one send callback. They own only horizontal overflow observation and the next-prompts control. They do not own conversation state or call APIs.
  - Panel owns expansion state, authenticated greeting, timestamps, header controls, conversation wrappers, and composer.
  - CSS uses the existing `ask-lisno-panel` namespace with explicit modifiers for expansion and component-specific selectors. No global element rules or changes to shared answer CSS.
- Preserve request history exactly: greeting, display timestamps, and expanded state never enter API inputs.
- Confirm the existing test and local-browser entry points. Use synthetic fixtures for screenshots; never expose private account/project data or credentials.

## T2. Build the project card and quick prompts

- Implement a compact project card with the resolved name and recognized `project-stage`/`project-status` facts. Require stable identity agreement; account-level, clarification, mismatched, and unsupported responses do not produce a misleading project card.
- Keep original source facts and narrative available through the existing answer renderer. Do not parse prose, suppress limitations, or introduce an extra project fetch.
- Use existing branding or a simple decorative local vector for the visual tile. Do not use generated/stock property images.
- Implement the four approved quick prompts through the existing send callback, in one horizontally scrollable strip. Observe container/content changes and scroll position; expose the next control only while content remains ahead. Keyboard focus must reveal focused chips.
- Disable submission while busy or access is unverified; remove observers/listeners on unmount. Use accessible names, native buttons, and no icon dependency.
- Add focused behavior tests for valid/partial/mismatched project data, absence of invented metrics, prompt dispatch, disabled prompts, and overflow-control visibility/operation.

## T3. Implement the reference styling

- Restyle the header, title/subtitle, avatar sizes, decorative leaf motif, window controls, conversation spacing, left/right bubbles, time labels, inset card, prompts, composer, and secondary team link.
- Use scoped semantic custom properties for surfaces, ink, muted text, borders, action green, radius, and spacing. Keep source disclosures, pricing details, errors, and lists readable within the new bubble width.
- Size normal and expanded layouts against both viewport dimensions; preserve safe-area and visual-keyboard offsets. At narrow widths use side gutters and a mobile-safe textarea font.
- Keep header and composer outside the scrollable conversation. Ensure long names, unbroken text, multiline drafts, and commercial output cannot force horizontal page overflow.
- Provide visible focus, disabled, pending, and error styling. Decorative vectors are inert and aria-hidden; avoid hover animation, blur, heavy shadows, and new motion dependencies.
- Verify specificity against themed and unthemed shells without modifying shared/global CSS.

## T4. Integrate without changing conversation authority

- Derive the greeting from the current authenticated name with a safe fallback. Keep it visible at the conversation start while excluding it from request history. Session changes must reset all personalized display state.
- Add submission and response-received timestamps to in-memory turn state. Preserve original submission time during retries; response time updates only when a valid answer is accepted. Continue displaying server `checkedAt` in source details.
- Add minimize, expand/restore, and close controls. Minimize and close use the existing cancellation/dismissal path and retain conversation/draft. Expansion changes only the current dialog dimensions and never remounts the session. Keep focus on a valid control and preserve Escape/return-focus behavior.
- Integrate avatar/bubble wrappers, the project card, and persistent prompts without duplicating user/assistant text or changing the request/resolution/pagination code paths.
- Reshape the composer around the multiline input and accessible circular Send button. Preserve Enter, Shift+Enter, IME, input bounds, busy guard, error text recovery, and the existing team link.
- Keep history hidden during access verification. Preserve generation/abort guards, changed-list refresh, and denial cleanup. A 503 retains the failed question and exposes Retry answer.
- Extend the existing launcher integration tests for greeting/fallback, identity change, minimize/reopen, expand/restore, timestamps/retry, persistent prompts, and 503 behavior. Retain existing authorization, focus, pagination, ambiguity, and commercial-answer assertions.

## T5. Review and refine the integrated screen

- Stop concurrent writers before integrated review. In Mode A run `integrity_reviewer`; in Mode B perform equivalent review inline.
- Review session isolation, stale request suppression, access revalidation, project identity matching, supported data only, no hidden financial details, and no unsupported/inactive controls.
- Inspect the rendered implementation against the supplied image using the same representative content at a comparable aspect ratio. Adjust density, spacing, typography, bubble widths, header decoration, and composer alignment through the owning writer.
- Exercise normal/expanded layouts, opening/closing, quick prompts, project selection, keyboard submission, retries, source disclosures, and team navigation. Confirm the underlying page remains usable because the dialog is non-modal.
- Resolve confirmed review findings before final checks. Recheck changed areas after fixes; do not repeat unaffected suites without a reason.

## T6. Verification and acceptance evidence

Run focused automated checks in `frontend/` on the integrated worktree:

```sh
npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/ask-lisno/AskLisnoProjectCard.test.tsx src/features/ask-lisno/AskLisnoQuickPrompts.test.tsx src/features/messages/ChatAssistantResult.test.tsx src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
npm run typecheck
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

Broaden testing only when failures or shared-impact evidence justify it. No backend/OCR suites are required for a frontend-only change. There is no lint script.

| Acceptance criterion | Evidence |
| --- | --- |
| AC1: reference fidelity | Visually inspect screenshots of welcome and resolved answer, including header, bubbles, card, prompts, and composer. |
| AC2: controls and interaction | Automated lifecycle/input tests plus rendered minimize, expand/restore, close/reopen, prompts, retry, and team-link interactions. |
| AC3: real project facts | Asymmetric project fixtures, identity mismatch rejection, missing-data case, and absence of sample metrics/read receipts/online claims. |
| AC4: existing behavior | Existing launcher and shared-answer regressions for permissions, history, clarification, pagination, sources, financial qualifiers, and cancellation. |
| AC5: state coverage | Welcome; pending; success; 503; verification failure; denied access; long answer/name; missing facts; long price answer. |
| AC6: responsive/accessibility | Browser checks at 375 × 812, 390 × 844, 768 × 1024, 1440 × 900, and short landscape around 844 × 390; reduced visible height around 390 × 430 to exercise keyboard constraints. Check normal/expanded state, horizontal overflow, composer visibility, focus order, accessible names, reduced motion, and contrast. |
| AC7: integrated quality | Exact focused test counts/results, typecheck, production build, whitespace check, and final dirty paths recorded after writers stop. |

Use a real mobile keyboard check if available; otherwise clearly report simulated visual-viewport coverage instead of claiming device verification. Check the default client shell and an alternate theme. Run accessibility inspection on representative welcome, answer, and error states without claiming whole-app conformance.

Store temporary synthetic screenshots and browser evidence under a task-specific ignored output directory or `/tmp/lisno-ask-lisno-redesign-2026-10-11/`. Do not commit screenshots, caches, fixtures containing private data, or build outputs.

Final handoff links the principal changed files and approved documents, reports exact checks and visible behavior, and names any remaining limitation or unrun verification. Do not claim the AI provider's 503 issue is fixed by this redesign.

## Approval status

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution mode: A, parallel native sub-agents.
- Implementation, integrity review, focused tests, build, and synthetic browser QA: completed locally. No deployment, commit, or production action performed.

## Implementation and verification record

The panel and launcher now provide personalized greeting, sage header, decorative local botanical SVG, minimize/expand/restore controls, timed conversation bubbles, verified project summary cards, persistent horizontal prompts, and an integrated composer. Project facts require matching stable IDs. Existing answer details, price qualifications, cancellation, permission checks, and session isolation remain in place. No dependencies or API contracts changed.

Affected frontend paths:

- `frontend/src/features/ask-lisno/AskLisnoPanel.tsx`
- `frontend/src/features/ask-lisno/askLisno.css`
- `frontend/src/features/ask-lisno/AskLisnoProjectCard.tsx` and its test
- `frontend/src/features/ask-lisno/AskLisnoQuickPrompts.tsx` and its test
- `frontend/src/features/estimates/AskLisnoLauncher.tsx` and its test

Independent integrity review identified a composer selector mismatch and missing visible project identity for answers without a card. Both were fixed and re-reviewed with no further confirmed defects. Textarea height is remeasured when the viewport, expansion, or history visibility changes.

All commands listed in T6 ran on the final integrated source and exited 0:

- Focused tests: **97 passed in 6 files** (launcher 48, project card 12, prompts 5, shared answers 16, client navigation 2, estimate panel 14).
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite reported chunks over 500 kB, including the main bundle, ExcelJS, and dashboard ECharts. Bundle splitting was outside this redesign.
- `git diff --check`: passed; final status contains only the eight scoped frontend files and the two design documents.

Browser evidence used the real panel and application styles in a temporary Vite harness with synthetic user/project/API data. No database or provider requests were used. Normal and expanded layouts passed geometry checks at **375 × 812, 390 × 844, 768 × 1024, 1440 × 900, 844 × 390, and 390 × 430**: no horizontal page overflow, visible composer, viewport-contained panel, usable conversation area, and no empty-textarea scrolling. Screenshots were inspected for welcome, answer, long project name, and commercial output.

Rendered checks covered minimize/reopen with retained draft and returned focus; expand/restore; Enter submission and Shift+Enter newline; Escape; prompt focus visibility; pending-state controls; cancellation and retry; 503 text retention and retry without duplicate turns; verification failure hiding history; denied-access clearing; missing facts; long narrative/name; and price output on mobile and desktop. The team link dismissed the panel on activation. The underlying page remained operable. Reduced-motion mode was exercised, and panel typography/palette remained stable between the client shell and messaging shell. Axe reported **zero violations** in the panel for welcome, answer, and 503 states using WCAG 2 A/AA and 2.1 AA tags; this is not a whole-app accessibility audit.

Evidence directory: `/tmp/lisno-ask-lisno-redesign-2026-10-11/`. It contains `verification-tests.log`, `verification-typecheck.log`, `verification-build.log`, `browser-final-checks.log`, and synthetic screenshots. The temporary harness and CLI artifacts are outside the repository. Build output remains ignored under `frontend/dist/`.

Limits: mobile keyboard coverage used reduced browser height, not a physical device/OS keyboard. The full frontend suite, backend/replica-set/OCR suites, and live-provider behavior were not run; the focused frontend and shared-renderer checks passed. There is no lint script. The earlier provider 503 issue remains outside this redesign. No migrations, seeds, database sync, deployment, commits, or pushes were performed.

# Main Line Overview reference layout: task plan

Date: 2026-09-25
Status: Draft. Awaiting task-plan approval (Gate 2). No implementation has started.
Source of truth: [approved specification](../specs/2026-09-25-main-line-overview-layout-design.md), approved by the user on 2026-09-25. If this plan and the specification disagree, the specification wins; report the conflict before continuing.

## Outcome and acceptance mapping

Parent task: implement and verify the approved Overview reference layout for the Main Line workspace. It is the only parent task in progress during execution.

| Criterion | Deliverable | Tasks |
| --- | --- | --- |
| AC1 Visual parity | Combined bar, icon-headed cards at 1:2, restyled history and tabs | T2, T6 |
| AC2 Save behavior | Save moves to the bar for Overview, Mode, and Recommendation & Exclusions. Quality is unchanged | T2, T4, T6 |
| AC3 Truthful "Last saved" | Time derived from section envelopes, with a fallback, updating without screen-reader announcements | T1, T2, T4, T6 |
| AC4 Read-only and permission views | No Save or quick-add actions where they are not allowed | T2, T4 |
| AC5 States preserved | Loading, error, stale, empty, temporary item, no revision | T2, T4, T6 |
| AC6 Responsive and accessible | Width matrix, 200% text, keyboard order, axe | T2, T6 |
| AC7 Regression and hygiene | Focused and full frontend checks, diff hygiene | T0, T5, T6 |

Dependency graph: T0 → (T1 ∥ T2 ∥ T3) → T4 → T5 → T6.

Affected areas, all frontend: the item-workspace page and status bar, the Overview panel, the Surfaces panel, revision history, the three workspace stylesheets, helper modules, and their tests. Backend, OCR, mobile, shared UI primitives, and shell files are not affected.

## Settled contracts

These contracts let the parallel lanes work without editing each other's files. A lane that needs a contract change reports it to the primary agent before acting.

### C1. Last-saved helpers (T1, new `knowledgeLastSaved.ts`)

```ts
export interface KnowledgeSaveStamp {
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** ISO `updatedAt` of the latest author save across a tab's envelopes, or null. */
export function latestKnowledgeSectionSave(
  envelopes: readonly (KnowledgeSaveStamp | null | undefined)[]
): string | null;

/** "just now", or Intl long wording such as "2 minutes ago" or "yesterday". Null if unparseable. */
export function formatKnowledgeRelativeTime(timestamp: string, now?: number): string | null;
```

- `latestKnowledgeSectionSave`:
  - Returns null for an empty list, or when any entry is missing (not loaded yet).
  - Ignores entries whose timestamps don't parse, and entries whose `updatedAt` is not later than `createdAt` (never saved).
  - Otherwise returns the original `updatedAt` string of the latest remaining entry. If none remain, returns null.
- `formatKnowledgeRelativeTime`:
  - Returns "just now" when less than 60 seconds have passed. Future timestamps also return "just now".
  - Otherwise, rounds the elapsed time down to the largest fitting unit: minutes under 60, hours under 24, days under 30, months under 12, then years. It formats the result with one module-level `new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" })`. Rounding down means it never overstates elapsed time.

### C2. Revision status labels (T1, `knowledgePresentation.ts`)

Add `KNOWLEDGE_REVISION_STATUS_LABELS = { draft: "Draft", active: "Active", superseded: "Superseded" }`, declared with `satisfies Readonly<Record<KnowledgeRevisionStatus, string>>`.

### C3. Combined bar (T2, `KnowledgeWorkspaceStatus.tsx`)

```ts
export interface KnowledgeWorkspaceSaveCommand {
  readonly sectionLabel: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly lastSavedAt: string | null;
  readonly onSave: () => void;
}

export interface KnowledgeWorkspaceStatusProps {
  readonly item: KnowledgeItemDetail;
  readonly command?: KnowledgeWorkspaceSaveCommand;
}
```

- **Root.** Stays `<Surface as="section" className="knowledge-workspace-status" variant="subtle" aria-label="Workspace status">`.
- **Completeness.** `.knowledge-workspace-status__completeness` holds "Configuration completeness", `{percentage}%`, and the existing `ProgressBar`, labelled "Configuration completeness" with value text "{percentage}% complete".
- **Commands.** When `command` is present, `.knowledge-workspace-status__commands` has `role="group"` and `aria-label="{sectionLabel} commands"`. It contains:
  - **Live status.** A `role="status"` element with the existing text, chosen in this priority order:
    1. Not editable: "Read-only revision"
    2. Saving: "Saving {label}…"
    3. Save failed: "Save failed. Review the message below and try again."
    4. Dirty: "Unsaved changes"
    5. Otherwise: "All changes saved"
  - **"Last saved" text.** Shown when the revision is editable, clean, and error-free, and `lastSavedAt` formats. The live element then becomes visually hidden (`sr-only`). A visible element outside the live region, `.knowledge-workspace-status__last-saved`, reads `Last saved <time dateTime={lastSavedAt} title={formatKnowledgeDateTime(lastSavedAt)}>{relative}</time>`.
  - **Save button.** Only when editable: `Button.knowledge-workspace-status__save` with `leadingIcon={<Save />}`, `busy={saving}`, `busyLabel="Saving {label}…"`, and `disabled={!dirty}`. Its text is "Save {label}", or "Saving {label}…" while saving.
- **No version text.**
- **Timer.** A 30-second interval refreshes the relative text only while "Last saved" is visible. It resets when `lastSavedAt` changes and is cleared on unmount.

### C4. Page wiring (T2, `KnowledgeItemWorkspacePage.tsx`)

- **The `command` prop.** Pass it only when `revision && activeSection !== "quality"`:

  | Field | Value |
  | --- | --- |
  | `sectionLabel` | `activeSectionLabel` |
  | `editable` | `editable` |
  | `dirty` | `activeDirty` |
  | `saving` | `activeSaving` |
  | `saveError` | `activeSaveError` |
  | `onSave` | `() => void saveActiveSection()` |
  | `lastSavedAt` | derived as described below |

- **Remove the in-panel bar.** Delete the in-panel `KnowledgeSectionCommandBar`, `commandVersionLabel`, and the unused import. Keep `KnowledgeSectionCommandBar.tsx` itself; the Quality panel still uses it.
- **Deriving `lastSavedAt`.** Before any early return, call `useQueries` once per backend section of the active tab, using `KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS[activeSection]`. For Quality, or when there is no revision, pass an empty list. Each query uses:
  - the existing key `knowledgeQueryKeys.section(mainLineId, revision.id, key)`
  - the same `getKnowledgeSection` query function the panels use
  - `enabled: false`

  Pass the queries' `data` to `latestKnowledgeSectionSave`.
- **Why `enabled: false` and not `skipToken`.** Verified in TanStack Query 5.101.4:
  - Each observer copies its options onto the shared query (`QueryObserver.setOptions` → `query.setOptions`).
  - Client-level refetches call `query.fetch(undefined)` with those stored options.
  - Section keys sit under `knowledgeQueryKeys.item(mainLineId)`, which every save invalidates.

  A `skipToken` observer would therefore make every post-save refetch reject. `enabled: false` with the real query function reads the cache, adds no request, and leaves refetches working.

### C5. Card heading (T2, new `KnowledgeCardHeading.tsx`)

```tsx
<div className={`knowledge-section-heading knowledge-card-heading ${className ?? ""}`}>
  <div className="knowledge-card-heading__identity">
    <span className="knowledge-card-heading__icon" aria-hidden="true">{icon}</span>
    <div><h2 id={titleId}>{title}</h2><p>{description}</p></div>
  </div>
  {trailing}
</div>
```

Props: `icon`, `titleId`, `title`, `description`, optional `trailing` (the read-only or dirty label), and optional `className`. Three cards use it:

| Card | Icon | `titleId` | Extra class |
| --- | --- | --- | --- |
| UOM | `Box` | `knowledge-overview-configured-title` | none |
| Surfaces | `UserRound` | `knowledge-mode-surfaces-heading` | `knowledge-mode-surfaces__heading` |
| Revision history | `Clock` | `knowledge-history-title` | none |

Heading text, ids, levels, and surface labels are unchanged.

### C6. Revision entry (T2, `KnowledgeRevisionHistory.tsx`)

Each `li.knowledge-history__entry.knowledge-history__entry--{status}` contains:

- A decorative icon in a `span[aria-hidden]`: `RefreshCw` for Draft, `CheckCircle2` for Active, `History` for Superseded.
- `strong` with "Revision N".
- A pill: `span.ui-status.ui-status--{warning|success|neutral}.knowledge-history__status`, with a `CircleDot`, `CheckCircle2`, or `Circle` icon and the C2 label.
- One line with "Updated {formatKnowledgeDateTime}".
- One line with "{percentage}% complete".

The shared `StatusBadge` is not used here and is not changed. The history `Surface` keeps the classes `knowledge-history knowledge-workspace-history-rail`.

### C7. Styling boundaries (T2)

- **Edit in place.** Change existing rules in place instead of layering overrides. Check the actual cascade: role themes load later, so follow the item-workspace specificity patterns already in use.
- **Tokens.** No new colors, fonts, or shadows.

  | Use | Token |
  | --- | --- |
  | Olive accent | `var(--button-primary-bg)` |
  | Icon-tile tint | `color-mix(in srgb, var(--button-primary-bg) 8%, var(--role-deck, var(--color-surface)))` |
  | Ink | `var(--role-ink, var(--color-text))` |
  | Muted ink | `var(--role-ink-muted, var(--color-text-muted))` |
  | Lines | `var(--role-line, var(--color-border))` |

- **`ai-estimator-knowledge.css`:**
  - **Status block** (currently lines 2849–2895): replace with the combined bar. One row holds completeness, the progress bar (about 8px tall with an olive fill, in this bar only), status, and Save. It wraps to two rows when space runs out. Save is full width at ≤480px. Coarse pointers keep 44px targets.
  - **Dead rules:** remove the unused `.knowledge-workspace-status .knowledge-summary-*` rules.
  - **Quality bar:** keep every `.knowledge-section-command-bar*` rule; the Quality panel still uses them.
  - **UOM row:** one column at every width, with `.knowledge-overview__quick-add` stretched. Update the 768px and 480px duplicates to match.
  - **Surfaces controls:** the select grows beside Add Surface and wraps below it on narrow cards.
  - **History:** add rules for the history header and entries.
- **`knowledge-configuration-ui.css`:**
  - **Overview layout:** start the container query at 44rem with `minmax(0, 1fr) minmax(0, 2fr)`, then tune from T6 evidence.
  - **Redundant override:** drop the UOM-row override inside that query.
  - **Card headings:** add the shared `.knowledge-card-heading*` rules: a tile of about 44–48px with an icon of about 22px.
- **`knowledge-reference-workspace.css`:**
  - **Tab strip:** labels of about 14px, padded tabs, and a 3px olive indicator spanning the padded tab. Inactive labels are muted. Hover and focus-visible styles stay.
  - **Quality:** keep the `[data-reference-section] .knowledge-section-command-bar` rules.
  - **Rail offset:** change `.knowledge-reference-rail`'s 60px offset only if T6 shows misalignment.

## Ownership and parallel safety

All paths are under `frontend/src/features/ai-estimator-knowledge/` unless noted.

| Task | Mode A owner | Mode B owner | Exclusive write scope | Must not modify |
| --- | --- | --- | --- | --- |
| T0 | Primary | Primary | `/tmp/lisno-main-line-overview-qa/` (baseline evidence) | Any repository file |
| T1 | Helper `frontend_implementer` | Primary | New `knowledgeLastSaved.ts`, new `knowledgeLastSaved.test.ts`, `knowledgePresentation.ts`, `knowledgePresentation.test.ts` | Everything else |
| T2 | UI `frontend_implementer` | Primary | `KnowledgeItemWorkspacePage.tsx`, `KnowledgeWorkspaceStatus.tsx`, new `KnowledgeCardHeading.tsx`, `KnowledgeOverviewPanel.tsx`, `KnowledgeModeSurfacePanel.tsx`, `KnowledgeRevisionHistory.tsx`, `ai-estimator-knowledge.css`, `knowledge-configuration-ui.css`, `knowledge-reference-workspace.css` | T1 files (import only), all tests, `KnowledgeSectionCommandBar.tsx`, `KnowledgeBasketQualityPanel.tsx`, `KnowledgeModePanel.tsx`, `KnowledgeReferenceContextRail.tsx`, `knowledge-quality-workspace.css`, `frontend/src/components/ui/*`, `frontend/src/styles/*`, shell files, backend |
| T3 | QA helper | Primary | `/tmp/lisno-main-line-overview-qa/harness/` only | Repository files and earlier `/tmp/lisno-*` evidence |
| T4 | The T2 implementer, continuing | Primary | `KnowledgeItemWorkspaceLayout.test.tsx`, `KnowledgeScreens.test.tsx`, new `KnowledgeWorkspaceStatus.test.tsx`, new `KnowledgeRevisionHistory.test.tsx`, `KnowledgeOverviewPanel.test.tsx`, `KnowledgeModeSurfacePanel.test.tsx` | Production files (report defects to T2), the unrelated uncommitted changes in `KnowledgeScreens.test.tsx` |
| T5 | `integrity_reviewer` (read-only) | Primary | None | All files |
| T6 | `verification_runner` and primary | Primary | `/tmp/lisno-main-line-overview-qa/`, this plan's execution record, and the spec's status line | Product files |

- **Mode A order.** After T0, T1, T2, and T3 run in parallel; their write scopes don't overlap.
  - T2 codes against C1 and C2 and wires those imports once T1 lands. It never writes to T1's files.
  - T4 waits for T1 and T2.
  - T5 waits for T4.
  - T6 waits for T5 and its fixes.
- **Mode B order.** T0 → T1 → T2 → T4 → T3 → T5 → T6, all inline.
- **Roles in this session.** Claude Code has no custom Codex roles. Each named role runs as a general-purpose subagent briefed with its deliverable, file ownership, invariants, and the no-overlap rule. The reviewer is told to stay read-only.
- **Shared worktree.** Tests run during concurrent edits can see half-finished states. Only T6 results on the integrated tree count.

## Tasks

### T0. Baseline and ownership capture

Owner: primary. Dependency: plan approval and a chosen execution mode. No repository writes.

1. **Record the starting state.**
   - Re-read `AGENTS.md`.
   - Save `git status --short` to `/tmp/lisno-main-line-overview-qa/initial-status.txt` and the in-scope diffs to `initial.diff`.
   - Record SHA-256 hashes of every T1, T2, and T4 file. Production targets should be clean.
   - Save the existing uncommitted changes in `KnowledgeScreens.test.tsx` separately, so T4 can show they were preserved.
2. **Capture the "before" rendering.**
   - Copy the earlier harness files (`server.mjs`, `entry.tsx`, `auth.tsx`) from `/tmp/lisno-configuration-image-qa/` to `/tmp/lisno-main-line-overview-qa/before-harness/`. Point the copy at port 4193 and leave the original evidence untouched.
   - Before any product file is written, capture screenshots and geometry JSON of Overview, Mode, Recommendation & Exclusions, and Quality at 1920, 1440, 1280, and 390px.
   - Record the per-path request log for a scripted visit to all four tabs.
3. **Run the baseline tests.** Run these focused tests and save the output to `baseline-tests.log`, noting any failures that already exist:
   - `KnowledgeScreens`
   - `KnowledgeItemWorkspaceLayout`
   - `KnowledgeOverviewPanel`
   - `KnowledgeModeSurfacePanel`
   - `KnowledgeFoundation`
   - `knowledgePresentation`
   - `KnowledgeBasketQualityPanel`

Acceptance: a reproducible "before" state, recorded hashes and request counts, and clear ownership of every file with uncommitted changes.

### T1. Last-saved helpers and revision labels

Dependency: T0. Implements C1 and C2.

1. Implement both helpers with no React dependency.
2. Write unit tests for both helpers, each with an explicit `now`:
   - **`latestKnowledgeSectionSave`:** an empty list, a missing entry, equal stamps (never saved), unparseable stamps, a mix of saved and unsaved, the latest of several, and the original string returned unchanged.
   - **`formatKnowledgeRelativeTime`:** 0s, 59s, 60s, 119s, 120s, 59m, 60m, 23h, 24h ("yesterday"), 47h, 48h, 29d, 30d, 11 months, 12 months, a future stamp, and an invalid stamp.
3. Add a test for the C2 labels.

Verify: `cd frontend && npm test -- src/features/ai-estimator-knowledge/knowledgeLastSaved.test.ts src/features/ai-estimator-knowledge/knowledgePresentation.test.ts`

### T2. Workspace UI implementation

Dependency: T0 and the C1/C2 contract. T1's code can land later. Implements C3–C7.

1. Build the combined bar (C3): the states, the visually hidden live status beside the visible "Last saved", the interval, and the Save button.
2. Wire the page (C4): pass the `command` prop, remove the in-panel bar, and add the `enabled: false` cache observers before any early return.
3. Add `KnowledgeCardHeading` (C5) to the UOM, Surfaces, and Revision history cards.
4. Stack the UOM controls in one column and make the Surfaces control row flexible. Keep every existing condition: read-only, saving, catalog states, "Unavailable value", selected-surface details, and dirty labels.
5. Build the revision entries (C6).
6. Make the CSS changes (C7).
7. The primary agent or the T2 owner runs one read-only 21st search for "icon-tile card header" and "progress and save toolbar" patterns, to sanity-check spacing against the existing design system. Nothing is installed, generated, or written remotely.
8. Self-check with `cd frontend && npm run typecheck`. Report any change needed outside the exclusive scope before making it.

Acceptance: R1–R7 are implemented within scope, the Quality bar is unchanged, and no file on the "must not modify" list is touched.

### T3. QA harness for this change

Dependency: T0. Writes only to `/tmp/lisno-main-line-overview-qa/harness/`.

1. Start from the T0 copy on port 4193, bound to 127.0.0.1 only. Keep synthetic data and full fetch interception. Use the local Playwright and Chrome installation from earlier QA; add no project dependency.
2. Add fixture variants, selected by URL parameters:
   - `saved=1`: sections whose `updatedAt` is later than `createdAt`. Overview was saved 2 minutes ago, advanced 10 minutes ago, pricing 3 minutes ago, and recommendations 1 day ago.
   - `readonly=1`, `archived=1`, `perm=read`, `perm=update-no-create`
   - A temporary item.
   - `history=loading|error|empty`
   - The existing section, catalog, and detail states.
3. Make section updates return an in-memory synthetic success envelope: `version + 1`, `updatedAt = now`, and `aggregateVersion + 1`. Add an optional `saveResult=fail|conflict|slow` for the other paths. Nothing is forwarded, and every write is recorded in `qa.writes`. All other non-GET requests stay blocked with 409.
4. Expose per-path request counts, so R2.1 (no extra request) can be checked against the before-harness run.
5. Validate with `node --check server.mjs` and an esbuild transform of `entry.tsx`. Write `harness-notes.md` listing the URLs and helpers.

Acceptance: every variant renders against the live worktree, and the repository is not written to.

### T4. Test updates and new coverage

Dependency: T1 and T2.

1. **`KnowledgeItemWorkspaceLayout.test.tsx`:**
   - Update the source-hook and status-strip assertions to match the combined bar.
   - For the UOM row, assert one column and a stretched quick-add button at every width.
   - Keep the command-bar rule assertions that still apply to Quality.
   - Add assertions for the 1:2 container query, the card-heading tile rules, and the olive tab indicator, each read from the stylesheet that owns it.
   - Use exact selectors such as `.knowledge-workspace-status {`, because the test helper matches substrings.
2. **`KnowledgeScreens.test.tsx`:**
   - "Overview commands" contains no "Version".
   - Each of the three tabs has exactly one Save, inside the "Workspace status" region and outside the tab panel.
   - On Quality, the bar shows completeness only, with no page-level Save.
   - Saved fixtures show "Last saved 2 minutes ago", and a save changes it to "Last saved just now". Never-saved fixtures keep "All changes saved".
   - Read-only and archived views show "Read-only revision" and no Save.
   - Visiting Mode makes exactly one `getKnowledgeSection` call per Mode section key; the disabled observers add none.
   - Update the existing "Workspace status" test: the region may contain save status, but still no revision numbers or activation readiness.
   - Preserve the existing uncommitted changes.
   - Pin only `Date` (`vi.useFakeTimers({ toFake: ["Date"] })` with `vi.setSystemTime`), so TanStack Query and user-event timers keep running.
3. **New `KnowledgeWorkspaceStatus.test.tsx`:**
   - The status-text table.
   - Fake-timer ticking from 2 to 3 minutes, with the live text unchanged.
   - The `<time>` attributes.
   - No Save when not editable.
   - Busy labels.
   - Progress-bar semantics.
4. **New `KnowledgeRevisionHistory.test.tsx`:**
   - Draft, Active, and Superseded labels and pills.
   - Decorative icons hidden from assistive technology.
   - Two meta lines per entry.
   - Loading, error, stale, and empty states unchanged.
5. **`KnowledgeOverviewPanel.test.tsx` and `KnowledgeModeSurfacePanel.test.tsx`:**
   - Icon tiles hidden from assistive technology.
   - Headings still `["UOM", "Surfaces"]`.
   - Add Unit comes after the select in DOM order.
6. Keep axe checks wherever a file already uses `expectNoAutomatedAccessibilityViolations`.

Verify: `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeWorkspaceStatus.test.tsx src/features/ai-estimator-knowledge/KnowledgeRevisionHistory.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`

### T5. Integrity review

Dependency: T4. Read-only. Review the integrated diff against:

- **Spec and contracts:** R1–R7, D1–D7, and C1–C7.
- **No backend impact:** no API, permission, or persisted-data change, and no added request.
- **Save behavior:** save, discard, conflict handling, and the unsaved-changes guard behave as before.
- **Untouched areas:** Quality, `StatusBadge`, `ProgressBar`, and `Button` are unchanged.
- **Cache observers:** use `enabled: false`, never `skipToken`.
- **Live region:** the timer does not trigger announcements.
- **CSS:** scope and specificity hold against role themes, responsive rules are correct, and each removed dead rule is justified.
- **Hygiene:** unrelated work is intact, and tests assert behavior rather than trivia.

Route findings to the T2/T4 owner, then review the fixes.

### T6. Final verification and browser QA

Dependency: T5, with its fixes resolved.

1. **Automated checks, in order:**
   1. The T1 and T4 focused test lists.
   2. Adjacent regression tests: `KnowledgeFoundation`, `KnowledgeBasketQualityPanel`, `KnowledgeReferenceContextRail`, `KnowledgeModeLayout`, `KnowledgeModePanelPendingChanges`, `KnowledgeModeSpecificationsSave`, and `knowledgeMutationSync`.
   3. `cd frontend && npm run typecheck && npm test && npm run build`
   4. `git diff --check`, then `git status --short` compared with T0.
2. **Browser QA with the T3 harness:**
   - **Width matrix.** Check 1920, 1440, 1280, 1024, 768, 390, and 320px across all four tabs. Record geometry for each: whether the bar fits one row, bar height, the UOM-to-Surfaces width ratio, the tab indicator, rail alignment, and any overflow.
   - **Interactions.** Walk through clean → dirty → saving → "Last saved just now". Also check a failed save, the conflict dialog, and the unsaved-changes guard when switching tabs.
   - **Other states.** Check the read-only, archived, and permission variants, the temporary item, and loading and error states.
   - **Accessibility.** Check 200% text zoom and keyboard order, and run axe (no new violations).
   - **Request counts.** They must match the before-harness run.
   - **Comparison.** Place before and after screenshots next to the reference at 1440 and 1920px.
3. **Record and clean up.**
   - Record the exact commands, test counts, results, screenshots, and anything not run in the execution record below.
   - Update the spec's status line.
   - Stop the servers and browsers, and list the temporary files left behind.

## Stop conditions

- **Stop and ask the user if:**
  - R2 turns out to need an API change or an extra request.
  - R2 needs any data source other than section envelopes.
- **Report to the primary agent before:**
  - Editing any file outside the owning task's scope.
  - Changing Recommendation or Quality layout files, even when T6 shows misalignment.
- **Existing test failures:** record failures that were already present, and fix them only if they block this task.
- **Layout fallback:** if the 1:2 layout makes the UOM card too cramped at 1440px, report the geometry and propose a breakpoint or ratio adjustment that stays within R4.

Out of bounds for every task: commits, staging, pushes, deployment, dependency or lockfile changes, backend changes, seeding, migrations, and changes to real data.

## Execution record

Pending. Filled in during implementation and verification.

# Mobile project detail reference UI: task plan

Date: 2026-09-25. Gate 2 (task plan). Source of truth: [spec](../specs/2026-09-25-mobile-project-detail-reference-design.md), approved 2026-09-25. Acceptance criteria are cited as AC1–AC6.

## Preconditions

- Before any write, capture the dirty-path set: `git status --short > <scratchpad>/mobile-project-detail-initial-status.txt`.
- The files this plan will write are clean. `featureDefinitions.ts`, `registry.ts`, `package.json`, `package-lock.json` and everything under `frontend/` stay untouched (AC5).
- No new dependencies. The image copy uses macOS `sips`, which needs no package changes.

## Tasks (dependency-ordered)

### T1. Hero artwork asset
- **Owns:** `mobile/assets/brand/project-detail-interior.jpg` (new).
- **Work:** Convert `frontend/src/assets/projects-living-room.webp` to a JPG about 1200×400 and under 150 KB with `sips` (read-only on the source). Confirm the file size and dimensions.
- **Traces to:** Scope 1, A2, AC1.
- **Depends on:** nothing.

### T2. Presentation model
- **Owns:** `mobile/src/features/projects/projectDetailModel.ts` and `projectDetailModel.test.ts` (both new).
- **Work:** Write a pure `presentProjectDetail(data, role)` that returns a discriminated shape: `kind: "admin" | "staff" | "client"`, plus the hero (name, id, status label/tone, created), facts, sections (groups of label/value rows), quick summary, and people (named only).
  - Port the web rules from `adminProjectPresentation.ts`: title-case workflow labels, "Estimation Approval" while the designer assignment is pending, the estimate label and value, the approved value only from `approvedBaseline`, and the initial budget range.
  - Formatting: INR `en-IN` with no decimals; UTC dates; the staff/client progress percentage comes from the backend `progress` field; "Not captured" and "No estimate yet" as fallbacks.
  - Unwrap `data.project` like the current `projectRecord`. Return `null` for unreadable data.
- **Tests:**
  - Admin, staff and client payloads, using two unequal projects.
  - Approved with a baseline, approved without a baseline (shows "Approved baseline unavailable"), and a draft estimate.
  - Missing propertyType, budget, lead and estimator; an invalid date; long values.
  - No admin-only labels in staff or client output; people lists contain named entries only.
- **Traces to:** Scope 2–4 and 7, R1–R3, AC1–AC3, AC6.
- **Depends on:** nothing. Can run in parallel with T1.

### T3. Detail UI components and screen composition
- **Owns:** `mobile/src/features/projects/ProjectDetailOverview.tsx` (new: hero, fact tiles, collapsible detail cards, quick summary, team, and a responsive two-column wrapper) and `mobile/src/features/projects/ProjectStructure.tsx` (edit).
- **Work:**
  - In `ProjectStructure`, replace the eyebrow, title and generic `recordFields` summary with `ProjectDetailOverview`, driven by the T2 model.
  - Keep the floors/stages/tasks hierarchy, `TaskEditor`, the create and upload actions, `DesignVersionWorkspace`, `WorkflowWorkspace` and "Refresh project" in the same order, with unchanged props and logic. Only restyle their containers and headings: paper surface, thin border, restrained radius, olive headings.
  - Use `useWindowDimensions` for the layout: one column below 900 dp in the order hero → facts → sections → summary/team → operational content. At 900 dp and above, a main column plus a 300 dp side column (illustrative figure, quick summary, team). The figure appears only in the two-column layout.
  - Hero: the `ScaffoldContentBack` slot, decorative image hidden from accessibility, cream overlay, header-role title, and metadata row (status badge using the `ProjectCard` palette, Project ID, Created).
  - Collapsible cards: default open, `accessibilityRole="button"` with `accessibilityState.expanded`, 44 dp minimum targets, and label/value rows that stack when `fontScale > 1.3`.
  - Use `colors`, `fonts` and `spacing` tokens only.
- **Traces to:** Scope 1–6, R4–R6, AC1, AC2, AC4.
- **Depends on:** T1 and T2.

### T4. Screen container and back placement
- **Owns:** `mobile/src/features/workspace/RecordDetailScreen.tsx` (projects branch only) and `mobile/src/app/record/[featureId]/[recordId].tsx`.
- **Work:**
  - In the projects branch, use a projects-only content style: a wider max width (about 1200) and the same padding. Show the existing "Updating…" refetch cue.
  - In the record route, pass `backPlacement="content"` only when `destination.id === "projects"`. The messages props and every other feature stay unchanged.
- **Traces to:** A3, R4, R6, AC1, AC5.
- **Depends on:** T3, which renders `ScaffoldContentBack`.
- **Ordering note:** T3 and T4 touch different files, but T4 must not land without T3. Otherwise the projects detail screen would lose its back button.

### T5. Rendered screen tests
- **Owns:** `mobile/src/features/projects/ProjectStructure.test.tsx` (new).
- **Work:** Mock `ScaffoldContentBack`, `DesignVersionWorkspace`, `WorkflowWorkspace` and the hierarchy actions as markers, and render `ProjectStructure` with admin and staff payloads. Assert that:
  - hero text, facts, sections, quick summary and team render;
  - collapsing a section toggles its content and expanded state;
  - the operational markers render in order and floors render for staff;
  - the two-column layout appears at 1024 width and one column at 360;
  - the page is usable at 320 width and fontScale 2 (no clipped text, rows stacked);
  - no reference-only UI appears (Messages tab, Assign Designer, edit/More buttons).
- **Traces to:** AC1, AC2, AC4, AC6.
- **Depends on:** T3.

### T6. Integrity review and verification (integrated result)
- **Owns:** no source files. Reports only.
- **Work:**
  - Review the final diff against R1–R6 and the finance and role-scoping invariants.
  - Confirm with `git status --short` against the captured set, and `git diff --stat -- frontend backend`, that no frontend or backend path changed.
  - Run the checks in the Verification section.
  - If an Android emulator or device is available, run the app to capture phone and tablet screenshots (temporary files in the scratchpad) with enlarged text. Otherwise report the visual check as not run.
- **Traces to:** AC5, AC6.
- **Depends on:** T1–T5.

## Parallelism

- T1 and T2 are independent and can run in parallel.
- T3 needs T1 and T2.
- After T3, T4 and T5 can run in parallel. They own disjoint files.
- T6 runs last, on the integrated tree.
- Shared contract: the T2 model's exported types are fixed before T3 starts. Any change to them is reported to the T3 owner, and the primary agent reconciles it.

## Verification

- Focused: `cd mobile && npm test -- src/features/projects/projectDetailModel.test.ts src/features/projects/ProjectStructure.test.tsx`
- Regression: `cd mobile && npm test -- src/features/projects src/features/workspace src/navigation`
- Full: `cd mobile && npm run typecheck && npm test`. Any pre-existing failures in unrelated dirty areas are reported separately with their output.
- Hygiene: `git diff --check` and `git status --short`, compared with the initial snapshot.
- There is no lint script, so no lint claim will be made.

## Rollback

Delete the new files (asset, model, overview, tests) and revert the edits to `ProjectStructure.tsx`, `RecordDetailScreen.tsx` and the record route. There is no data or API impact.

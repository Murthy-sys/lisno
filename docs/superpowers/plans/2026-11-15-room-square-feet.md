# Room square feet task plan

Date: 2026-11-15
Status: Implemented and verified
Specification: [Room area beside inline dimensions](../specs/2026-11-15-room-square-feet-design.md).
Specification and task plan approved by the user's consecutive “Approved” responses. The specification's original proposal status is retained; approval is recorded here. Execution mode A selected by the user.

## Scope and ownership

Add the derived area display using the existing room dimensions. Limit implementation to:

- `frontend/src/features/leads/RoomsMultiSelectDropdown.tsx`
- `frontend/src/styles/estimator-dashboard.css`, room-picker selectors only
- `frontend/src/features/leads/RoomControls.test.tsx`, focused rendering assertions only

These files already contain the approved inline-dimensions work. Preserve those changes and all unrelated work. No parent adapters, saved fields, business calculations, backend files, dependencies, or lockfiles need changes.

## Tasks

### 1. Capture the current baseline

Primary owns this task. Before edits, record dirty paths and the existing target diffs under `/tmp/lisno-room-square-feet-qa`. Confirm the current picker suite passes. This protects the previous implementation and supports acceptance criterion 4.

### 2. Add area text and responsive placement

Primary owns the picker and its focused assertions. Derive each room's area directly from its supplied length and width, with positive/finite input and product checks. Render an accessible room-specific **Area (sq ft)** result, digit grouping, at most two decimal places, and **Not set** for missing/invalid values. Preserve every callback and input behavior. Covers criteria 1–2.

The style owner adds a scoped `.rooms-select__area` treatment after Width on sufficiently wide rows. On narrow rows, place it below the measurement columns, keeping Length/Width beside the name. Preserve existing tokens and field sizes; allow long formatted values to wrap without overflow. Covers criterion 3.

If Mode A is selected, a frontend sub-agent owns only the scoped CSS while primary owns the picker/tests. These independent edits may run in parallel against the agreed class name. Tell the agent it is not alone and must preserve existing changes. If Mode B is selected, primary implements both slices inline. No additional review agents are needed for this small change.

### 3. Verify the integrated result

Primary owns final verification after both slices finish. Keep only one parent task in progress.

- Run `cd frontend && npm test -- src/features/leads/RoomControls.test.tsx`. Verify 200 × 200 → 40,000, decimal formatting, edits isolated to the intended room, missing/invalid values, and read-only display using focused existing-suite coverage. Criteria 1–2.
- Run `cd frontend && npm run typecheck` and `cd frontend && npm run build`. Criterion 4.
- Use the existing synthetic browser setup to inspect the shared picker at desktop, 390px, and 320px. Check the area, retained Length/Width alignment, no overflow, and accessible naming. No real project writes. Criterion 3.
- Run `git diff --check`; compare target and unrelated diffs to the baseline. Record exact results and any limitations here. Criterion 4.

Do not run unrelated suites. Temporary verification files stay under `/tmp` wherever possible; remove any temporary repository harness. No seed, migration, production action, commit, push, or deployment is included.

## Completion record

Both documents approved; Mode A selected. All three tasks complete. Primary implemented the picker and focused assertions; `room_area_css` implemented only the scoped CSS. Primary inspected the integrated diff and desktop/mobile screenshots. Exactly the three planned frontend files changed, plus this execution record. The area is derived during rendering; no new state or persisted field was introduced.

Verification:

- `cd frontend && npm test -- src/features/leads/RoomControls.test.tsx`: baseline **9 passed**; integrated final **11 passed**, exit 0. Covers grouped area, rounding, isolated edits, missing/non-positive/overflow values, and disabled inspection alongside existing room interactions.
- `cd frontend && npm run typecheck`: exit 0, no diagnostics.
- `cd frontend && npm run build`: exit 0. Existing Vite large-chunk warnings remain.
- Browser checks on the actual synthetic Sales setup at **1440px, 390px, and 320px**: 40,000 sq ft and 90.63 sq ft display correctly; Length/Width stay beside the room; area follows Width on desktop and sits below the fields on narrow screens. No page or row overflow. Blank input shows Not set, decimal editing shows 37.04 sq ft, reopening preserves the result. No console/route errors, unexpected requests, or write requests. Automated accessibility scan: **zero violations**.
- `git diff --check`: passed. Compared baseline tracked diffs and unrelated untracked hashes: **no unexpected changes**.

Initial snapshots, test/build logs, browser results, and screenshots are in `/tmp/lisno-room-square-feet-qa`. The temporary browser session was closed; no repository harness was needed. The existing local frontend server was reused and left running.

Unrelated suites and backend/OCR/mobile checks were intentionally not run. No lint script exists. No dependencies, migrations, seeds, production mutations, commits, pushes, or deployment. No unresolved issue within this change; the existing build-size warning remains.

# Add Specification: copy previous details

Date: 2026-11-18
Status: Approved and implemented in Mode A. Tasks 1–4 complete; independent review and final integrated verification passed. No deployment or saved-data mutation was performed.
Source of truth: [Approved specification](../specs/2026-11-18-add-specification-copy-previous-design.md). Its approval was received in chat after the specification file was created.

## Approved result and boundaries

Add Specification creates a new editable row prefilled from the last named row in the current tier's local list, including unsaved values. Copy Item name, selected Brands, and Brief description; use a fresh specification ID. Skip trailing blank-name rows. When there is no named source, start empty.

Preserve the source and all references. Reuse existing in-scope Brand definitions; do not copy hidden compatibility data or pricing/quantity configuration. Reject an invalid source without partially adding a row or substituting an older source. Preserve the unique-name rule and explain that the copied name must change before saving. Done, Save Mode, discard, failed-save, and read-only behavior retain their existing roles.

No backend, shared validation/contract, dependency, schema, or service-lifecycle changes are planned. Do not restart the backend or mutate existing saved Configuration for verification. No deployment, migration, seed, commit, or push is included.

## Execution and ownership

Follow the repository's execution-choice gate after this plan is approved. Only one parent task is in progress at a time; independent slices may run within that task.

- **Primary agent:** approved interpretation, baseline preservation, integration, this plan, and final handoff. Owns any unexpected shared-file dependency; do not let separate writers resolve it differently.
- **Frontend implementation owner:** `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx` and its `.test.tsx` only. Owns new-row initialization, source checks, inline guidance, and direct interaction tests.
- **Save-flow test owner:** `KnowledgeModeSpecificationsSave.test.tsx` and, only where necessary, `KnowledgeModePanelPendingChanges.test.tsx`. Tests existing save/discard behavior without changing product sources.
- **Integrity reviewer:** read-only integrated review of identity, source selection, validation, and shared-consumer behavior.
- **Verification owner:** runs final checks after writers and review fixes finish; does not change product sources.

In Mode A, the two implementation/test slices may run concurrently after the behavior contract and dirty-target baselines are shared. Every writer must preserve others' changes and stay within assigned files. In Mode B, the primary performs the same work sequentially. Do not start subagents before execution-mode selection for this plan.

## Dependency-ordered tasks

### 1. Preserve and establish the regression

Dependency: task-plan approval and execution-mode choice.

- Capture the current dirty-path set and relevant per-target diffs before editing. This worktree already contains approved GST, tier-description, and Brand-prefill work, including dirty targets listed above. Read and retain their existing changes.
- Establish the focused failing case: with a saved/named row containing two Brands and a description, Add currently opens blank. Add assertions for the requested prefilled values and distinct ID.
- Agree source selection and invalid-source handling between owners. Use current props only, not a cross-tier cache or “last used” global record. Treat source Brand references as local IDs.

Acceptance: AC1–AC3 have concrete fixtures; prior edits are understood and protected.

### 2. Implement and cover the copy workflow

Dependency: task 1. Two bounded slices may progress in parallel.

**Frontend slice:**

- Extend Add initialization using the existing fresh-ID factory. Choose the last named source from the current list and copy only its visible fields, with a separate Brand-ID array.
- Validate source name/description and Brand associations using existing validators and in-scope definitions. If unsafe, leave the current draft intact and expose an accessible corrective message. Do not normalize malformed data into an apparently valid copy or skip to an older named row.
- Keep controls enabled under existing edit permissions. Add compact naming guidance while a copied name conflicts with another row; preserve duplicate-name validation and normal picker behavior.
- Preserve limits, focus, clearing, and no-source behavior. Rerenders or background queries must not reapply copied values.
- Cover multiple unequal rows, blank trailing rows, unsaved source edits, same-context source selection, empty Brands, invalid/missing references, no source, read-only access, limits, unchanged source/Brand definitions/references, and no hidden-field copying.

**Save-flow test slice:**

- Through the rendered Mode panel, add the prefilled copy and confirm duplicate-name save fails without a write. Select/add a unique name, save, reload with a fresh query client, and verify two distinct IDs and preserved copied fields.
- Confirm Done does not persist, discard removes the copy, and failed saves retain it. Preserve the source payload and version/CAS expectations.
- Verify the currently supplied tier determines the source; another tier/Main Line cannot contribute values. Use asymmetric values to detect accidental borrowing.
- Adjust older tests only where they assumed an intentionally replaced empty-Add behavior; retain their original independent assertions and regression coverage.

Acceptance: AC1–AC5.

### 3. Integrate and review

Dependency: both task 2 slices finished.

- Inspect the complete diff against the baseline and reconcile shared-consumer effects. The builder is also used by the general section editor and isolated proposal workflow; no new global lookups or permission changes are allowed.
- Review fresh specification identity, preserved shared Brand semantics, invalid-source behavior, duplicate-name guidance, save/discard state, and no rerender-based refilling.
- In Mode A, use an independent integrity reviewer; in Mode B, perform the equivalent inline review. Resolve findings before final verification.

Acceptance: AC2–AC5 and preservation of previous requested work.

### 4. Verify and hand off

Dependency: task 3 and any fixes complete. Run against the final integrated worktree.

| Check | Command / evidence | Coverage |
| --- | --- | --- |
| Focused frontend regressions | `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSpecificationItemNamePicker.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.test.ts src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` | AC1–AC5; picker/validation and isolated-consumer compatibility |
| Types and bundle | `cd frontend && npm run typecheck` and `cd frontend && npm run build` | AC6 |
| Rendered accessibility/visual behavior | Check keyboard focus, enabled controls, naming guidance, and Add → edit → Done/reopen at desktop and narrow width using synthetic local data. Use the existing frontend or an isolated frontend harness without restarting backend services or changing saved user records. | AC1, AC4–AC6 |
| Repository hygiene | `git diff --check` and `git status --short` with baseline comparison | AC6; unrelated work preserved |

Backend/OCR and full repository suites are not required for this frontend-only change unless new evidence reveals a cross-boundary regression. There is no repository lint script. Do not claim visual or other checks passed if unavailable; record the precise limitation.

Remove only newly created temporary QA files/processes and retain a concise evidence record. Report exact commands/results, affected files, unrun checks, and that no deployment or data migration occurred. Mark implementation complete only after the approved acceptance criteria are verified.

## Implementation and verification record

### Delivered behavior and affected files

- `KnowledgeSpecificationBuilder.tsx`: Add creates a fresh specification from the last named row in the current scoped draft, copying name, ordered Brand selections, and description. It preserves original raw rows and Brand definitions, excludes hidden fields/references, keeps controls editable, and explains the copied name's uniqueness requirement. Malformed sources are rejected without a partial copy.
- `KnowledgeSpecificationBuilder.test.tsx`: rendered coverage for previous-row selection, trailing blanks, fresh IDs, edit isolation, intentional clearing, current unsaved values, source scoping, malformed data, limits, focus/accessibility, and first-item recovery.
- `KnowledgeModeSpecificationsSave.test.tsx`: duplicate-name preflight, rename/save/fresh-client reload, failed-save retention, discard, untouched original data/references, and asymmetric tier/Main Line isolation. Two older empty-Add fixture assumptions were adjusted while preserving their original assertions.
- `KnowledgeModePanelPendingChanges.test.tsx` and all other prior product changes were preserved. No API, shared validator, backend, dependency, or lockfile changes were required for this slice.

Both implementation owners reproduced the blank-Add regression before fixing it. The independent integrity review found one P2 recovery issue: validating all Brand definitions before opening the first blank item blocked repair of an existing unnamed Brand. The correction preserves structural guards but applies semantic Brand-copy checks only when a named source exists. A rendered regression exercises Add → select unnamed Brand → edit its name. The reviewer cleared the final correction with no remaining blocker.

### Final checks

| Check | Result |
| --- | --- |
| Six-suite focused command listed in task 4 | **195 passed across 6 files**, exit 0 |
| `cd frontend && npm run typecheck` | Passed, exit 0 |
| `cd frontend && npm run build` | Passed, exit 0; existing Vite warning about chunks over 500 kB remains |
| `git diff --check` | Passed |
| `git status --short` | Same 92 path/status entries as initial baseline; no unrelated added or removed paths |
| Chrome at 1440×1000 and 390×844 | Passed; copied fields visible before selection, editable controls, fresh ID, unchanged source/Brand definitions, edited/cleared values retained after Done/reopen |
| Browser accessibility/errors | Zero axe violations, panel horizontal overflow, console/page errors, or API requests |

The browser harness used synthetic local values and the actual rendered builder; API requests were blocked. Screenshots were visually inspected at both widths. AC1–AC3 are covered by the builder tests and browser checks, AC4–AC5 by builder/Mode save/pending tests and shared-consumer regressions, and AC6 by accessibility, visual checks, typecheck, build, and hygiene.

Evidence is retained under `/private/tmp/lisno-copy-previous-*`: initial status/target-diff snapshots; builder/save red and green logs; recovery regression logs; `final-tests.log`, `final-typecheck.log`, `final-build.log`, and `final-status.txt`; and `browser.json`/`browser.log`. Newly created QA HTML/TSX/browser script and the two screenshots under `frontend/output/playwright/` were removed after inspection. Build output and TypeScript caches are ignored under `frontend/dist/` and `frontend/node_modules/.tmp/`.

Backend/OCR/full-repository suites and live database persistence were not rerun for this frontend initialization change. Save/reload was verified with rendered Mode integration tests and fresh query clients. There is no lint script. No application services were started, stopped, or restarted; no user records, migrations, seeds, commits, pushes, or deployment were performed.

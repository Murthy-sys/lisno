# Main Line Pricing Intro Removal Task Plan

## Approved source of truth

- Specification: `docs/superpowers/specs/2026-09-01-main-line-pricing-intro-removal-design.md`

## Ownership boundaries

- Production presentation: `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- Focused Pricing editor tests: `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx`
- Integrated Mode/workspace regressions: `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx` and, only if required, `KnowledgeModeSectionStateRemoval.test.tsx`
- No ownership is granted over backend files, API contracts, query keys, shared UI primitives, dependencies, lockfiles, or unrelated dirty paths.

## Dependency-ordered tasks

### 1. Capture the focused pre-change contract

- Inspect the current Pricing structured-array controls and identify a non-introductory Pricing interaction suitable for dirty/save/conflict tests.
- Record the relevant dirty-path status/diff before editing.
- Run the smallest existing Pricing/Mode tests that cover the current contract.

Acceptance criteria:

- Existing pricing specifications and price-version functionality are traced before the intro fields are removed.
- Unrelated work in all owned files is understood and preserved.

### 2. Remove only the Pricing intro presentation

- Suppress the inner Pricing editor heading and helper paragraph when `sectionKey` is `pricing`.
- Remove the Technical description, Internal vendor notes, and Quality level controls from the Pricing editor render path.
- Keep the Pricing Mode block toolbar, validation summary, structured pricing editors, read-only behavior, and loaded payload unchanged.

Acceptance criteria traced to specification:

- AC1: highlighted heading/helper/three controls are absent.
- AC2: pricing specifications and price-entry/version controls remain present.
- AC7: no backend, API, persistence, authorization, cache, dependency, or primitive changes.

### 3. Update focused Pricing tests

- Assert the removed heading/helper/controls are absent.
- Assert pricing specifications and price-entry/version controls remain available.
- Add a regression proving a remaining Pricing edit preserves pre-existing hidden `technicalDescription`, `internalVendorNotes`, and `qualityLevel` payload keys.
- Preserve immutable price-version and validation coverage.

Acceptance criteria traced to specification:

- AC1, AC2, and AC3.

### 4. Rebase integrated Mode behavior tests

- Replace tests that use Technical description as their dirty Pricing input with an existing pricing-specification or price-entry interaction.
- Keep assertions for one Save Mode action, Pricing → Quantity & margin ordered CAS, partial failure, conflict attribution, dirty navigation, read-only, and archived behavior.
- Confirm Overview Pricing specifications summaries remain unchanged.

Acceptance criteria traced to specification:

- AC4 and AC5.

### 5. Focused verification

Run:

```text
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx
```

Then run:

```text
cd frontend && npm run typecheck
git diff --check
```

### 6. Integrated verification and hygiene review

Run:

```text
cd frontend && npm test
cd frontend && npm run build
git status --short
```

- Inspect the final scoped diff for payload preservation and unrelated-work safety.
- Report any unrun live-browser check; do not substitute another browser if none is connected.

Acceptance criteria traced to specification:

- AC6 and AC7, plus final confirmation of AC1–AC5.

## Parallel execution

No implementation tasks are safely parallel for this small change. Production rendering and the integrated Mode tests overlap the same Pricing contract, so they should be updated sequentially and verified together.

## Completion evidence

- Exact changed files and behavior summary.
- Focused and full test counts.
- Typecheck, build, and `git diff --check` results.
- Confirmation that no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.
- Any remaining visual-QA limitation.

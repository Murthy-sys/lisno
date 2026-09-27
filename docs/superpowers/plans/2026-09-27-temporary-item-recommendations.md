# Temporary-item Recommendation & Exclusions implementation plan

Specification: [Recommendation & Exclusions for temporary Configuration items](../specs/2026-09-27-temporary-item-recommendations-design.md).

Parent task: make the existing combined Recommendation & Exclusions section usable for temporary items in backend, web, and mobile Configuration. No implementation begins before this plan is approved and an execution mode is selected.

## Contract and ownership

- Keep the existing `recommendations` section API, payload, permission, version/CAS, and stable-ID relationship rules. New temporary items use `not_configured`; a valid Draft save derives applicability from saved content even when the old section said `not_applicable`. Historical Active revisions are immutable. New Draft/duplicate copies normalize only this section. Other temporary-only section restrictions continue.
- **Backend owner:** `backend/src/services/ai-estimator-knowledge-item.service.ts` and its focused service tests. No schema, route, authorization, migration, or AI calculation changes are planned.
- **Web owner:** `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`, `useKnowledgeSavedSummary.ts`, and focused tests including `KnowledgeScreens.test.tsx` and `useKnowledgeSavedSummary.test.tsx`. No backend or mobile files.
- **Mobile owner:** `mobile/src/features/knowledge/KnowledgeItemWorkspace.tsx` and `KnowledgeItemWorkspace.test.tsx`. No generated `.expo` files, shared modules, or web/backend files.
- **Primary agent:** product/contract decisions, specification and plan, ownership coordination, integrated diff review, and any shared-contract change that proves necessary. Existing dirty Expo log and router type files are preserved. Capture each target's pre-write diff again before assigning a writer.

## Dependency-ordered tasks

1. **Baseline and contract lock (primary agent).** Confirm the initial dirty-path set and target diffs. Confirm the combined tab, existing editor/save route, temporary applicability restrictions, and legacy-copy behavior against current code. The approved specification supplies the acceptance contract. No product-source edits in this task.
2. **Backend support (backend owner; AC2–4).** Add `recommendations` to permitted temporary sections and new-item defaults. On temporary recommendation saves, derive applicability from actual payload so a legacy `not_applicable` input cannot hide valid saved rules. Normalize this section in new Draft/duplicate copies without changing source Active records. Update focused service tests for new, existing, copied, nonempty, and empty temporary recommendations; retain rejection coverage for the remaining unsupported sections, stale versions, invalid relationships, and regular items.
3. **Web workspace and saved summary (web owner; AC1–2, AC5).** Show the standard combined tab for temporary items, remove the temporary redirect, and load/render the section in the saved summary. Ensure a save from a legacy `not_applicable` envelope sends usable applicability and that confirmed data alone updates the summary. Update focused web tests for tab access, save/reload, legacy state, empty/loading/error, read-only, identity isolation, and accessible tab navigation.
4. **Mobile workspace and saved summary (mobile owner; AC1–2, AC5).** Show the fourth tab and its Quick summary group for temporary items using the existing editor and section query. Preserve the current save/discard/conflict and permission behavior. Update focused native tests for tab access, save/reload, summary, unsaved changes, read-only state, and the four-tab layout at phone width.
5. **Integration and contract reconciliation (primary agent; AC1–5).** Review the combined backend/web/mobile behavior, including old temporary Drafts, Draft copies, and immutable Active history. Resolve any confirmed cross-layer mismatch in the owning slice. Check that recommendation rules from a temporary source retain stable target IDs and that a configured section reaches the existing context path. Do not expand authorization or introduce a new endpoint.
6. **Integrity review, then final verification (AC1–6).** In Mode A, use an `integrity_reviewer` after writers finish and a `verification_runner` after findings are resolved; in Mode B, perform those stages sequentially inline. Inspect the final diff and preserve all unrelated changes. Report exact results, unrun checks, and any remaining risk. No commit, push, deployment, seed, migration, or production mutation.

Tasks 2–4 have disjoint file ownership and may run in parallel only after the execution-choice gate selects Mode A. In Mode B the primary agent handles them inline. Integration and final verification run after all writers finish because the shared worktree can expose transient states during concurrent edits.

## Verification mapped to acceptance criteria

| Acceptance criteria | Evidence to collect |
| --- | --- |
| AC1, AC5: four tabs and accessible states | Web `KnowledgeScreens.test.tsx` interaction/accessibility assertions; mobile `KnowledgeItemWorkspace.test.tsx`; rendered web desktop/narrow layout and rendered mobile phone-width tab/summary check. |
| AC2: save and confirmed summary | Backend service save/read; web and mobile editor save/reload tests; saved summary tests that distinguish unsaved, failed/conflicted, and confirmed values. |
| AC3: legacy and copy compatibility | Backend service tests for old `not_applicable` temporary Drafts, nonempty/empty saves, new Draft and duplicate, unchanged Active source; web legacy-envelope test. |
| AC4: preserved invariants | Backend service regression for unsupported temporary sections, regular items, authorization through existing route coverage as indicated by changes, CAS, validation, and stable-ID targets. |
| AC5: state fidelity | Focused web/mobile loading, failure/retry, no revision, read-only/archived, item/revision switch, and summary tests; inspect phone-width tab hit areas and overflow. |
| AC6: integrated checks | Run `backend npm test -- tests/ai-estimator-knowledge-item.service.test.ts`, relevant frontend and mobile focused tests, typechecks for all three workspaces, frontend build and backend build, then `git diff --check` and `git status --short`. Broaden only for a concrete shared-contract risk. No lint script exists. |

Backend transactional tests use their established replica-set fixture. Visual verification must inspect rendered interactions, not only static snapshots. Android export or device certification may be added if the implementation changes native platform behavior; the planned tab change uses existing native components and requires a rendered phone-width check. Build/test artifacts stay out of the final diff.

## Integrated result and verification

Implementation tasks 1–5 are complete. The backend now accepts temporary Recommendation & Exclusions saves and normalizes legacy `not_applicable` sections on save or new Draft/duplicate copy. Web and mobile show the fourth section and its saved summary. The read-only integrity review found no confirmed defect. Existing Active revisions were not rewritten.

| Check | Result |
| --- | --- |
| Backend `npm test -- tests/ai-estimator-knowledge-item.service.test.ts` | 108/108 passed with the replica-set fixture |
| Frontend `npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t "temporary item workspace" --reporter=dot` | 8/8 temporary workspace tests passed |
| Frontend `npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx` | 96 passed, 14 failed; saved-summary file 16/16 passed. All 14 failures are in regular Mode/Overview tests and reproduce by exact test name in an isolated HEAD archive, where 76 passed and the same 14 failed. |
| Mobile `npm test -- --runInBand src/features/knowledge/KnowledgeItemWorkspace.test.tsx src/features/knowledge/KnowledgeRecommendationsEditor.test.tsx` | 15/15 passed across two suites |
| Backend, frontend, and mobile `npm run typecheck` | All passed |
| Backend and frontend `npm run build` | Both passed; frontend reported its large-chunk warning |
| Synthetic browser QA | Temporary Draft tab/editor and saved summary inspected at 1280, 390, and 320 CSS px. At 1280 and 320 px, document width matched viewport; axe found no violations, and there were no runtime errors or unexpected fixture requests. |
| Native layout check | Synthetic React Native test renderer verified the four-tab tree, labels, flex allocation, and 48dp minimum touch height at 320/411dp. Android pixel rendering was not checked; the existing emulator session was left untouched. |
| Repository hygiene | `git diff --check` passed. The two initially dirty `mobile/.expo` paths were not edited by this task. No commit, push, deployment, seed, or production mutation. |

The isolated HEAD comparison and structured test reports are under `/tmp/lisno-temp-rec-baseline-20260927/` and `/tmp/lisno-temporary-{backend,frontend}-vitest.json`. Synthetic browser screenshots are under `/tmp/lisno-temp-rec-web-*.png`. Build outputs are ignored `backend/dist` and `frontend/dist`. No lint script exists. Full workspace suites and Android device certification were not run; the affected flows have focused coverage and the documented browser/native renderer checks.

# Reference-matched estimate proposal PDF: task plan

Date: 2026-11-02
Status: Implemented and locally verified; not deployed
Specification: [Reference-matched estimate proposal PDF](../specs/2026-11-02-estimate-pdf-reference-template-design.md)
Specification approval: user replied `Approved` on 2026-11-02. This records approval without changing the specification during the plan-only stage.
Execution mode: A, parallel sub-agents, selected by the user on 2026-11-02.

## Outcome and boundaries

Generate new estimate proposals using the supplied booklet's composition, photographs, detailed tables, commercial pages, and closing page. Apply the confirmed commercial defaults to new documents, with actual project identity, quantities, prices, GST, and payment amounts. Preserve existing published PDFs, historical terms, authorization, client visibility, and approval/delivery behavior.

Use the existing PDFKit service boundary. Preserve its legacy renderer for old snapshots; add a separate modular proposal renderer and versioned metadata/defaults. Do not add Chromium, new payment/discount workflows, migrations, or a web editor redesign. No commit, push, deployment, production mutation, seed, or customer communication is authorized.

The user approved this plan and selected Mode A. Product changes, asset extraction, and implementation agents are authorized within this scope.

## Dependency order and ownership

Keep one parent task in progress. T2 and T3 are independent implementation slices under one implementation parent after T1 settles their shared contract.

| Task | Deliverable | Mode A owner | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0 | Current baseline and affected-path inventory | Primary | Plan approval and A/B choice | AC2, AC7, AC9 |
| T1 | Shared document contract, dispatch rules, defaults, and fixture design | Primary | T0 | AC2–AC5, AC7–AC9 |
| T2 | Reference assets, typography proof, full proposal renderer, build packaging | Backend renderer implementer | T1 | AC1, AC2, AC4–AC6, AC8 |
| T3 | Staff/publication/rendition integration and historical compatibility | Backend integration implementer | T1 | AC2–AC5, AC7, AC9 |
| T4 | Cross-layer reconciliation and complete rendered preview | Primary | T2 and T3 complete | AC1–AC9 |
| T5 | Independent integrity review and owner fixes | Integrity reviewer, then original owners | T4 | AC2–AC9 |
| T6 | Final integrated tests/build/render checks and handoff | Verification runner, then primary | T5 fixes complete | AC1–AC9 |

In Mode B the primary performs the same work sequentially without implementation agents. In Mode A use native agents with explicit boundaries; tell every writer that others are working in the repository and that existing unrelated edits must not be reverted, reformatted, or overwritten. Review and final verification run after writers finish.

## T0: baseline and source preservation

- Re-read current status and applicable instructions. The specification-stage baseline is under `/tmp/lisno-estimate-pdf-reference-qa/`; it is background until refreshed at implementation start.
- Capture dirty paths, relevant diffs, and per-target copies/hashes before assigning owners. Understand existing quotation, project-number, initiation, revision-history, and layout changes in shared targets.
- Retain the supplied PDF outside the repository. Its 12 rendered reference pages are already available in the QA directory. Use them for comparison, not as full-page raster production templates.
- Use synthetic clients, projects, amounts, and attribution in fixtures. Do not place the reference customer's name, project, price, dates, or full PDF into source/tests.

## T1: shared contract and defaults

Primary-owned files and responsibilities:

- New focused proposal metadata/defaults module, preferably `backend/src/domain/estimate-proposal.ts`, plus focused tests. Keep the serializable type, strict validation, versioned default definition, date/amount helpers, and invariant checks cohesive rather than duplicating them across renderers.
- `backend/src/services/estimate-pdf.service.ts`: additive input/option contract and dispatch boundary only. Keep the existing legacy generation path; delegate new booklet drawing to the renderer's new module.
- `backend/src/domain/estimate-client-review.ts`, `backend/src/services/estimate-client-presentation.ts`, `backend/src/services/estimate-revisions.service.ts`, and `frontend/src/api/types.ts`: optional validated proposal metadata alignment. Update relevant shared contract/OpenAPI definitions only where required by an actual exposed shape.
- Shared contract tests in `backend/tests/estimate-client-presentation.test.ts`, `backend/tests/estimate-revisions.replica-set.test.ts`, and any directly affected model tests. No renderer or publication-owner edits in these files after the interface is handed off without coordination.

Resolve and publish these implementation contracts before parallel writers start:

1. **Dispatch:** metadata with the supported proposal template identity selects the new renderer. Missing metadata selects the legacy renderer. Current staff export and new publication explicitly construct metadata; a lazy rendition of an old round must never gain today's defaults implicitly. Keep `standard`/`compact_client_delivery` compatible without applying a blanket text-size reduction to the new design.
2. **Frozen metadata:** include template/defaults identity, issue timestamp, validity date, canonical project reference when available, safe attribution, and the effective serializable commercial terms/payment definitions. Treat published metadata as immutable source evidence. Do not read mutable configuration to reinterpret an old proposal.
3. **Defaults:** capture 21/60 working days, five stages 10/40/25/20/5, three-working-day payment terms, 15-calendar-day validity, approved warranty/material/change terms, and reusable company information. Use actual project scope and actual authorized attribution. Never default the sample's negotiated price, discount, or personal identifiers.
4. **Dates:** use one issue instant and Asia/Kolkata calendar handling. Cover date and relative validity must agree across the generated artifact and committed snapshot. Test month/year boundaries and an instant near local midnight.
5. **Money:** validate safe integer paise; explicitly normalize supported legacy rupee inputs at the boundary. Derive stage amounts from actual payable total. Use a documented integer rounding rule for the first four stages and the residual fifth stage; assert nonnegative amounts and exact reconciliation, including small/fractional totals.
6. **Grouping/disclosure:** saved stable IDs determine grouping. Display only the authorized projection. Avoid inference that unselected items are client-supplied or that a zero/null amount implies a bundled free inclusion. Missing optional source concepts omit the corresponding optional panel.
7. **Validation:** reject malformed or unsupported explicit proposal metadata instead of stripping it and falling back silently. Continue accepting old snapshots without metadata. Bound free-text/default payload sizes.
8. **Attribution/reference:** use canonical saved project number when available. Capture authorized preparer identity only from established actor data; otherwise Team Lisno. Use Authorized signatory when no appropriate signatory is saved. No name-based identity joins.

Preserve full approval/source-digest checks. Trace every `toEstimateSnapshot`/`quotationSnapshotDigest` caller before adding metadata so a document timestamp cannot invalidate unrelated pricing-preview comparisons and no approval check is weakened to make a test pass.

## T2: assets and proposal renderer

Exclusive Mode A ownership:

- New `backend/src/services/estimate-proposal-pdf/` renderer modules and their renderer-focused tests.
- New `backend/src/assets/estimate-proposal/` reusable photos, brand artwork, deployable font assets if available, and a concise asset provenance/license note.
- `backend/scripts/copy-static-assets.mjs` and `backend/scripts/verify-estimate-pdf-build.mjs`.
- `backend/tests/estimate-pdf.test.ts` and new focused proposal-rendering tests. Preserve existing legacy pagination/source tests; add new-template assertions without deleting compatibility coverage.
- No edits to primary-owned contracts/dispatcher, routes, publication, rendition, or snapshot validators.

Implementation:

- Extract the six embedded photos without the sample's customer text and retain appropriate original resolution. Reuse Lisno vector branding where it matches, deriving only reusable artwork from the reference as necessary.
- First assess embedded Futura BT subsets and required character coverage. Do not copy a machine font as an assumed deployable asset. If the exact complete font cannot be recovered, select a deployable alternative, document its provenance and visible differences, and retain readable searchable text. Do not add a browser runtime to work around missing fonts.
- Establish A4 dimensions, reference-derived color/spacing/type tokens, reusable text measurement, page creation, images, rules, tables, and footers. Keep drawing code separate from source projection and financial calculations.
- Render a synthetic visual proof of cover, detailed table, payment page, and acceptance/closing page early; the primary reviews it before the remaining layout is treated as settled. This is implementation QA within the approved plan, not another routine user approval gate.
- Implement welcome, scope, dynamically paginated item tables, price summary with explicit tax disclosure, payment stages, workflow/timing, conditional exclusions, terms/materials, and acceptance. Retain both numeric and textual saved component/dimension detail needed to explain the estimate.
- Honor explicit scope/specifications over default exclusions/material descriptions; unsupported client-arranged details are omitted. Show visible-area summaries without exposing hidden line metadata or inventing reconciliation rows.
- Measure wrapped rows and continuation headers. Handle very long descriptions, long names, large numeric values, missing optional metadata, legacy ungrouped rows, and a changing table page count. Footers must reflect actual total pages.
- Package assets relative to compiled code. Reuse decoded images/fonts per generation where appropriate. Validate corrupt/missing required assets and generation failures before storage/publication succeeds.

Completion: synthetic reference-density booklet renders in the reference composition; renderer tests pass; typography differences are documented; compiled output does not depend on desktop files or system fonts.

## T3: integration, frozen history, and delivery

Exclusive Mode A ownership:

- `backend/src/routes/estimates.ts` for existing staff PDF export only.
- `backend/src/services/estimate-publication.service.ts` and `backend/src/services/client-quotation-rendition.service.ts`.
- `backend/src/services/client-quotation-projection.service.ts` and `backend/src/models/ClientQuotationRendition.ts` only if contract evidence requires a change; report the reason before changing their established identity/policy behavior.
- Directly related tests: `estimate-pdf-routes.test.ts`, `estimate-publication.test.ts`, `estimate-publication-mongo.replica-set.test.ts`, `client-quotation-rendition.replica-set.test.ts`, and `client-quotation-projection.test.ts`.
- No shared contract/parser/default/renderer/static-asset edits. Decision/collaboration/digest services are primary-owned integration targets unless an explicit extension is agreed after inspecting their baseline.

Implementation:

- Populate current staff-export metadata from the authorized current estimate/lead and the shared defaults. Do not write the estimate merely to download a PDF.
- For publication, capture one issue instant and effective metadata; feed the same document identity/terms to preflight PDF generation and the transaction's committed snapshot. Revalidate all relevant mutable preflight identity/source fields under the existing CAS/fencing rules before accepting the generated artifact.
- Preserve publication deduplication, sales/client approvals, source digests, immutable records, storage cleanup, and external-delivery independence. Never create a new revision for template lookup, read, or delivery retry.
- Carry frozen metadata through the authorized client projection. New renditions use that round's template identity/terms, original amounts, and current authorized visibility; old rounds use legacy rendering.
- Inspect existing rendition keys before changing them: the existing visibility digest already incorporates the snapshot and policy version. If frozen metadata is thereby included, reuse that identity without a new index or global policy bump. Do not invalidate or replace old cached artifacts merely for a new visual template.
- Verify persisted PDF byte/hash integrity and stored-artifact reads remain unchanged. Avoid touching email delivery or revision-download services unless a demonstrated integration defect requires it.

Completion: new draft/publication/rendition documents use the new template; old published documents stay byte-identical; new commercial defaults cannot appear in an old approved round; publication/authorization/visibility regression tests pass.

## T4: integrated preview and reconciliation

- Wait for both writers; inspect each task diff against its baseline, reconcile interfaces, and confirm no unrelated edits were lost.
- Verify all snapshot allowlists retain valid new metadata and reject invalid metadata. Trace quote approval, current-source checks, collaboration preview, client response, and revision reads with the final contract.
- Generate synthetic PDFs through the real generator and representative route/publication/rendition paths. Keep real mail disabled and use disposable local replica-set/storage fixtures.
- Render every generated page with Poppler, compare with the reference, and inspect representative pages at full readable size. Check no clipped rows, unintended blank pages, footer collisions, broken glyphs, or photo stretching.
- Keep a final synthetic proposal PDF under `output/pdf/` as the reviewable preview; keep page renders, logs, and temporary comparison artifacts under `/tmp/lisno-estimate-pdf-reference-qa/`. No real-client sample data should appear in the preview.
- Record file size, page count, generation time, typography choice, and dynamic-content adaptations. Check applicable attachment/storage limits before declaring the new default usable.

## T5: integrity review and owner corrections

In Mode A use `integrity_reviewer` for a read-only integrated review. In Mode B perform the equivalent review inline. Focus on:

- Correct estimate/lead/actor identity and safe attribution across preflight generation and transaction commit.
- Integer-paise totals, payment rounding, tax disclosure, and absence of a fabricated discount or balancing line.
- Immutable terms/template/date and approval/source-digest lineage.
- Client visibility, hidden-label leaks, legacy snapshots, cached renditions, and original revision PDF bytes.
- CAS/concurrent publication, storage cleanup, disabled/failed delivery, retries, and no unintended schema/index/migration requirements.
- Asset portability, bounded content, failure handling, and preservation of unrelated dirty work.

Assign confirmed fixes to the original owner. Final verification begins only after writers stop and review findings are resolved.

## T6: final verification and handoff

Start with the new helper/renderer tests, then run the existing affected lanes. New test filenames below are intended targets; record actual names if implementation consolidates them.

```sh
cd backend
npm test -- tests/estimate-proposal.test.ts tests/estimate-proposal-pdf.test.ts tests/estimate-pdf.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-component-pricing-contract.test.ts
npm test -- tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/client-quotation-projection.test.ts tests/client-quotation-rendition.replica-set.test.ts tests/estimate-client-presentation.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-review-storage.test.ts tests/estimate-client-review-models.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-delivery.test.ts tests/quotation-approvals.replica-set.test.ts tests/quotation-edits.replica-set.test.ts
npm run typecheck
npm run build
node scripts/verify-estimate-pdf-build.mjs
```

If shared frontend snapshot types change, run:

```sh
cd frontend
npm run typecheck
npm test -- src/features/leads/EstimateRevisionView.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/client/ClientQuotation.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx
npm run build
```

Use real replica-set integration for transactional publication and rendition paths. Broaden only for demonstrated affected consumers or unresolved failures; OCR is out of scope. There is no lint script.

| Verification fixture | Required evidence | ACs |
| --- | --- | --- |
| Two unequal clients/projects with distinct canonical references | No identity bleed, correct totals/attribution, no reference-customer text | AC2, AC4, AC9 |
| Reference-density booklet | Full section sequence, photo placement, typography comparison, dynamic page numbers | AC1, AC6 |
| Single-line, long-text, many-line, and Unicode fixtures | Safe pagination, selectable text, visible rupee and required name/specification glyphs | AC1, AC6 |
| Fractional and small payable totals; component-priced lines | Exact paise; five stage amounts reconcile; saved line amounts unchanged | AC4 |
| Hidden/unselected lines and duplicate labels with distinct IDs | No hidden metadata, no invented BY YOU scope, stable grouping, explicit inclusion precedence | AC5, AC9 |
| Old round, new round, default change, repeated read/delivery retry | Correct template dispatch and frozen terms; old byte/hash identity; no duplicate rounds/artifacts | AC3, AC7 |
| Concurrent publication, stale source, failed asset/storage, disabled/failed/successful delivery | Existing CAS/atomicity/cleanup/delivery invariants | AC7, AC9 |
| Compiled service without desktop/source assets | Packaged resources work, same layout, no host-font dependency | AC8 |

Finish with `git diff --check`, `git status --short`, and the task-only diff against the captured baseline. Stop only task-owned processes; move only newly generated untracked browser/render artifacts, never tracked repository files. Build outputs and caches must not be staged or committed.

Handoff includes the preview PDF, matching limitations, principal files/decisions, exact checks/results, unrun checks, and the statement that no deployment/migration/customer communication occurred. Do not describe an approximate font as exact or partially verified work as complete.

## Current stage

- Specification approved.
- Task plan approved; Mode A selected.
- Shared contracts, publication integration, and the complete reference-density booklet are implemented.
- All 12 preview pages have been visually inspected. Integrity findings were corrected and final verification passed.


## Implementation progress

- User approved the task plan and selected Mode A on 2026-11-02.
- T0 complete: captured 1,189 dirty/relevant baseline files and hashes under `/tmp/lisno-estimate-pdf-reference-qa/`.
- T1 contract/defaults created: optional frozen `proposal` metadata, strict shared validation, India-calendar validity, exact integer payment allocation, and legacy-by-absence renderer dispatch.
- Read-only source audit identified two additional required shared consumers: the strict `EstimateClientReviewRound` persistence sub-schema and Admin `mapSnapshot` in `estimate-client-review.service.ts`. Primary owns these extensions; their baselines were captured.
- Shared frontend/backend declarations are `shared/estimation/estimateProposal.d.ts`; declaration-only sharing preserves the backend's existing `rootDir` and deployable output structure. Runtime defaults/validation remain in backend domain.
- T2 and T3 implementation slices active. Renderer owns assets/layout/build packaging; integration owner handles staff export/publication/renditions. No overlap with primary-owned snapshot contracts.
- Existing canonical snapshot digest naturally binds new proposal metadata. Existing visibility digest already includes the parsed snapshot, so no rendition policy bump/index/migration is required.
- T3 complete: five publication/export/projection/rendition suites passed, 90 tests, including real Mongo transactions and real generated PDFs.
- Shared domain/model/parser tests passed, 143 tests. Admin/revision/approval/OpenAPI suites passed serially, 142 tests. Parallel replica-set runs encountered resource timeouts; serial reruns passed without changing product behavior.
- Backend and frontend typechecks passed. Final integrated build/test verification follows the integrity fixes.
- Typography uses packaged Jost Regular/Medium, Barlow Condensed Light, and Noto Sans Devanagari, with OFL license files. Original Futura BT is not recoverable as a complete reusable font; the preview documents this approximation.
- The 12-page synthetic preview uses all six extracted photos and measures about 1.74 MB. Original customer identity and commercial amounts are absent from fixtures. No dependency or lockfile changes were necessary.

## Final verification and handoff

- Delivered `output/pdf/lisno-estimate-proposal-preview.pdf`: 12 A4 pages, approximately 1.74 MB. All pages were rendered and visually inspected.
- Backend: 456 unique targeted tests passed across the 18 planned affected suites. The initial serial run found one wide-room-label overflow; after fitting was corrected, all 45 tests across the four affected PDF/route/rendition suites passed. No financial, publication, or authorization behavior was changed to address layout.
- Frontend: 30 tests passed across the five planned revision/client-estimate suites. Backend and frontend typechecks and production builds passed. Frontend build retains its existing large-chunk warning.
- Compiled artifact verification passed for both legacy PDF (7,820 bytes) and proposal booklet (1,732,677 bytes). `git diff --check` passed. No lint script exists.
- Integrity fixes: legacy logo processing is lazy and awaited; invalid proposal logos reject safely; long room/client/project names are fitted within safe bounds, with explicit rejection of pathological identity lengths; wide room labels and long commercial text have regression coverage. Welcome-price metrics already shrink to one measured line before their captions.
- Upon resuming, the saved preview and source remained available, but prior temporary QA logs/baselines had been removed. Earlier results above are preserved from the executed verification reports; compiled artifact verification and focused renderer checks were repeated on resume.
- Not run: unrelated full repository suites, OCR tests, production delivery or deployment. No migrations, seeds, commits, pushes, customer mail, dependencies, or lockfile changes occurred.
- Fidelity limitation: complete Futura BT fonts were unavailable. Packaged OFL alternatives preserve the composition with a documented typography approximation. Latin and Devanagari text are supported; unsupported glyphs fail explicitly rather than producing unreadable output.

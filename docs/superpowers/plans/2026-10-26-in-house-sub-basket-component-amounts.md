# In-house Sub-Basket component amounts: task plan

Status: approved; Mode A selected. T0–T7 complete. Implementation, integrity review, rendered checks and integrated verification are complete with the existing failures, timeout diagnostics and skipped checks recorded below. No new persistent test failures were identified. Baseline: 132 backend tests and 66 frontend tests passed. Initial worktree evidence is captured under `/tmp/lisno-in-house-sub-basket-amounts/`; product paths were clean. Final review compares initial revision `26e63050103423f3b276a2194053a25e765809d0` through the worktree because an external commit captured most implementation while verification was running.

Approved source: [In-house amounts from Sub-Basket components](../specs/2026-10-26-in-house-sub-basket-component-amounts-design.md), approved by the user on 2026-10-26 with the clarification below. The specification's earlier awaiting-approval label describes its creation stage; this plan records the subsequent approval without rewriting the approved document.

## Binding scope clarification

The user confirmed: “these calculation only when selected in-house at estimation” and all remaining calculations and flows stay as current.

This is a restriction on every task in this plan:

- New configured estimate arithmetic applies only to included Configuration lines whose selected estimate pricing mode is `in_house`, whose rate source is `configuration`, and whose selected tier has component configuration. Invalid/empty component configuration stays explicitly incomplete.
- PMC, Sub-Vendor, Standard automatic pricing, manual estimate rates, excluded lines and legacy In-house without component configuration keep their current behavior. The existence of component settings alone never activates the new calculation.
- Switching an editable line away from In-house removes its component-derived amount/basis from the active estimate calculation and returns to the existing destination-mode behavior. It does not delete saved Configuration components or alter sibling lines.
- Procurement's new component attribution applies only to source lines explicitly selected as In-house in the approved estimate. Use approved estimate metadata, not the Main Basket classification, a neighbouring line, or the Procurement mode selector as a substitute for this condition.
- A ready current In-house Procurement preview supplies its component costs. An existing Procurement decision for another mode retains its present calculation and display behavior. Do not force a decision to In-house or change mode availability/saving as part of this task.
- Existing approvals, customer review rounds, BOQ/tender/award source ownership, vendor commitments, dispatch activation and issued artifacts keep their current workflows and identities.
- Both estimate amounts and Procurement costs are covered. Each included Main Line contributes its own selected components using its own quantity; matching Sub-Baskets do not deduplicate different source lines.

These boundaries clarify the approved specification's In-house scope and non-goals. No second specification approval is required.

## Evidence and implementation approach

The existing estimate route validates a configuration rate against selected component base rates, then multiplies it by quantity (`backend/src/routes/estimates.ts`). Tier/dimension updates repeat this in `estimate-tiers.service.ts`. The complete independently rounded component formula already exists in `ai-estimator-knowledge-mode-calculation.ts` and is used by Procurement and assistant pricing. Reuse that arithmetic without altering its legacy modes.

Procurement already carries approved mode metadata through `procurement.service.ts`, `project-purchase-order-preparation.service.ts` and `procurement-basket-mode-groups.ts`; use this existing provenance for the new condition. Keep component target attribution separate from commercial source-line ownership.

Only documentation is dirty at plan creation: `docs/superpowers/specs/2026-10-26-in-house-sub-basket-component-amounts-design.md` is an untracked file created by this task. Capture a fresh status and target diffs before implementation because other work may arrive meanwhile. No dependencies or lockfile changes are expected.

## Contract to settle before parallel writers

The primary agent owns these cross-workspace contracts and publishes their final types before any dependent writer starts:

1. **Component amount basis.** Add an optional, versioned `in_house_components_v1` pricing basis and a server-derived `componentPricing` snapshot to affected estimate lines. Existing lines without that basis retain their current unit-rate contract. The snapshot includes source Main Line/revision/version, tier, selected component IDs, canonical quantity/UOM, component target IDs/names, separate Labour/Material selling amounts, exact component totals, exact line total and an input/configuration fingerprint. Source-line and room identity remain on the enclosing line. Do not store raw margin/cost rules in a customer-visible shape.
2. **Exact amount.** The persisted `amountPaise` equals the sum of independently rounded component selling amounts. An effective unit-rate display cannot become the source of that amount. If no exact two-decimal unit rate represents the calculation, the component basis remains valid without fabricating a rate. Readiness/serialization exceptions are restricted to the validated new basis; legacy unit-rate validation is unchanged.
3. **Read-only preview.** Add `POST /leads/:leadId/estimate/in-house-preview`, using the existing estimate authoring actor and lead-scope checks. Use a bounded batch of line identities, selected mode/tier/component IDs, quantity or dimensions, UOM and expected source versions. Return per-line ready/incomplete/conflict results, exact selling breakdowns and fingerprints. No database writes, token creation, audit mutation or delivery occurs. Register the endpoint in route operations/OpenAPI with existing estimate-authoring authority and no new role grant. This internal preview does not expose Configuration rules or costs.
4. **Save verification.** New component-basis writes carry the preview fingerprint and source versions; the server recomputes under the existing estimate save/CAS boundary. It rejects stale/mismatched evidence. The request cannot set authoritative component totals. Authoritative output snapshots are derived by the server.
5. **Procurement breakdown.** Add an optional backend-produced component breakdown only for approved-estimate In-house sources with current In-house calculation evidence. Each contribution retains `sourceLineItemKey`, component ID, target basket/Sub-Basket IDs, calculation quantity and separately labelled adjusted cost/selling benchmark. Group by composite target IDs, not labels. Absence on other modes preserves existing DTO behavior. Missing eligible evidence is explicitly incomplete; no fabricated allocation of approved revenue or vendor commitments.
6. **Client projection and compatibility.** Expose only stored selling breakdowns to customer views. An old approved line without a snapshot remains historical and unallocated at component level. Native preserves exact snapshots/amounts read-only. Old clients cannot silently turn the new basis into base-rate pricing; explicit web changes to manual pricing remain supported through the existing override flow.

Use existing shared estimation types where suitable; add a small `shared/estimation/estimateComponentPricing.ts` and a backend contract module only if needed to prevent divergent definitions. Preserve NodeNext `.js` imports in backend code. Final implementation may adjust names without changing this contract; a behavioral change requires reconciliation before dependent work.

## Dependency-ordered tasks and ownership

Only one parent phase is in progress at a time. Approval and Mode A selection are complete; the status above tracks execution.

### T0. Capture baseline and unchanged-mode fixtures

Owner: primary agent. Dependencies: task-plan approval and execution choice. Covers specification AC1–AC8 and the scope clarification.

- Record `git status --short`, relevant target diffs and current source revision in `/tmp/lisno-in-house-sub-basket-amounts/` before assigning writers. Understand any newly dirty target and assign ownership explicitly.
- Capture focused baseline tests for component pricing, estimate modes, Procurement projection and web amount calculation. Separate existing failures from regressions.
- Define unequal Project A/Project B fixtures with distinct Main Lines, quantities, UOMs, tiers and costs; include identical component IDs/names across separate source lines and mixed estimate modes.
- Add characterization expectations for unaffected PMC, Sub-Vendor, manual, Standard and legacy In-house results and flow transitions.

### T1. Freeze additive contracts and server calculation boundary

Owner: primary agent. Depends on T0. Covers AC1, AC4–AC7.

Owned paths: shared estimation contract modules; `backend/src/contracts/` additions; `backend/src/models/Estimate.ts`; `backend/src/domain/route-operations.ts`; shared OpenAPI entry points; `frontend/src/features/leads/leadsApi.ts`; `frontend/src/features/procurement/procurementBasketApi.ts`; corresponding native estimate type/schema boundaries. Publish exact ownership for any new file before another writer uses it.

- Freeze the new basis, preview input/output, fingerprint, snapshot and Procurement breakdown types, plus the exact In-house applicability predicate.
- Define a backend calculation service/domain helper that resolves current tier/component settings and calls the existing canonical calculator. Establish integer-paise validation and explicit incomplete reasons without modifying other formulas.
- Ensure schema/readiness distinctions between legacy unit-rate lines and new component-basis lines are explicit.
- Align route inventory/OpenAPI with the preview authorization contract and customer-safe projections.
- Verify contract compilation and focused formula/serialization tests before dependent writers start. Do not allow independent workers to invent fallback data or alternative amount fields.

### T2. Integrate estimate calculation, persistence and frozen history

Owner: estimate backend implementer in Mode A; primary agent in Mode B. Depends on T1. Covers AC1–AC6 and AC8's backend support.

Owned paths: estimate calculation helper/service implementation; `backend/src/domain/estimate-mode-pricing.ts`; `backend/src/routes/estimates.ts`; `backend/src/services/estimator-catalogue.service.ts`; `estimate-tiers.service.ts`; `estimate-publication.service.ts`; `estimate-client-presentation.ts`; `estimate-client-review.service.ts`; `estimate-pdf.service.ts`; corresponding estimate domain DTO consumers and focused tests. Shared model/types/registry changes return to the primary owner.

- Implement the read-only preview and exact server calculation for applicable In-house lines only. Resolve current saved draft before active and selected tier without fallback. Reuse validated dimension quantities.
- Integrate the same result into saves, explicit refreshes, tier/dimension changes, readiness and publication validation. Fence selected references/source versions through existing transactional protections.
- Preserve exact stored component totals and approved snapshot evidence through get/list/review/PDF/client paths. Do not recompute historical outputs from current Configuration or expose internal costs.
- Handle leaving In-house, explicit manual overrides and old/native payloads without stale basis leakage or silent downgrade.
- Keep existing statuses, CAS, audit identities, idempotency, approval and delivery semantics unchanged. Extend existing storage/repository paths only where actually affected.
- Test preview/save parity, forged input, stale versions, missing settings, explicit subsets, manual preservation, immutable publication and unaffected modes.

### T3. Add gated Procurement Sub-Basket attribution

Owner: Procurement backend implementer in Mode A; primary agent in Mode B. Depends on T1. Covers AC2–AC7.

Owned paths: `backend/src/domain/procurement-basket-projection.ts`; `procurement-basket-mode-groups.ts`; `project-purchase-order-preparation.ts`; related Procurement/preparation services only where the read projection needs data; Procurement-focused test files. Do not edit estimate services, shared contracts or canonical formula implementations assigned elsewhere.

- Carry/consume approved-estimate mode provenance and require its explicit In-house selection for the new component breakdown.
- Reuse current In-house preview components and their independent costs; resolve target display names by stable IDs. Preserve each source line's own quantity and tier.
- Aggregate same-target contributions across source lines once; preserve parent/room/project reconciliation and explicit incompleteness.
- Keep approved estimate revenue and commitments on their existing commercial sources. Preserve tender/BOQ identities, current Configuration freshness, activation requirements, mode saving, overrides and issued artifacts.
- Prove that a Procurement-only In-house decision for a non-In-house estimate source does not activate the new attribution. Prove that a later non-In-house Procurement decision retains its existing behavior.

### T4. Integrate web previews and component breakdowns

Owner: frontend implementer in Mode A; primary agent in Mode B. Depends on T1; uses T2/T3 contracts and integrates with their completed APIs before verification. Covers AC2–AC6 and AC8.

Owned paths: `frontend/src/features/leads/configuredEstimate.ts`; `LeadEstimateWorkspace.tsx`; `ConfiguredEstimateBuilder.tsx`; `EstimateInHouseComponents.tsx`; a focused preview API/hook and breakdown component if needed; associated styles/tests; Procurement scope/detail/breakdown components; affected tier and client estimate display consumers. Frozen `leadsApi.ts`/`procurementBasketApi.ts` contracts remain primary-owned.

- Request quantity-aware previews only for eligible In-house estimate lines. Use source versions and full pricing inputs in query keys; cancel/ignore stale results after input or mode changes.
- Display exact returned selling amounts. Preserve user inputs through loading/error/retry and prevent saving a stale component result without blocking unrelated legacy calculations.
- Show accessible expandable Labour/Material selling breakdowns with component target names. Produce reconciled Sub-Basket amount summaries, including targets outside the source catalogue group, without duplicating selection rows or grand totals.
- Keep manual price labels and existing manual rate behavior. Preserve destination-mode behavior when leaving In-house and existing catalogue navigation.
- Show gated Procurement component cost subtotals and contributing source lines while retaining approved/current/committed distinctions.
- Use existing visual primitives. No unrelated redesign, icon/dependency additions or motion. Verify keyboard/focus and narrow layouts.

### T5. Native and cross-consumer integration

Owner: primary agent. Depends on T1; can progress alongside T2–T4 on non-overlapping native paths. Covers AC3, AC5–AC7.

Owned paths: `mobile/src/features/estimate-authoring/` amount display/model/serialization consumers and tests; native customer estimate consumers/contracts; integration-only shared files already primary-owned.

- Preserve exact server amounts and component pricing snapshots on existing read-only native component lines. Remove any unit-rate recomputation for the new basis only.
- Verify native save/round-trip of unrelated editable lines cannot clear or reinterpret read-only component-priced lines. Preserve native PMC/Sub-Vendor/manual editing behavior.
- Reconcile full source types with web/server code, customer projections, tier controls and assistant amount consumers. Assistant calculations already use the canonical component formula; change only an actual compatibility mismatch, not its workflow.
- Confirm all affected queries refresh coherently after existing saves. Do not invalidate unrelated data indiscriminately.

### T6. Integrate and review financial/flow invariants

Owner: primary agent, then `integrity_reviewer` in Mode A. Depends on all writers finishing. Covers AC1–AC8.

- Inspect the integrated diff, resolve ownership conflicts and confirm every new calculation entry point uses the In-house estimate-selection condition.
- Audit money units/rounding, component attribution, duplicate IDs, two-project isolation, customer data exposure, old-client writes, source freshness, races and immutable history.
- Exercise mixed-mode regression cases before accepting the result. A confirmed regression in unaffected modes or approvals is a release blocker for this task.
- Resolve review findings and stop writers before final verification. In Mode B, perform the equivalent review inline.

### T7. Final verification and handoff

Owner: `verification_runner` in Mode A after T6 fixes; primary agent in Mode B. Covers AC1–AC8.

- Run the focused matrix below against the integrated worktree, then backend/frontend typechecks, full suites and builds because the estimate contracts and financial totals are shared.
- Run native typecheck, focused authoring/customer contract tests and Android export when native production source changes. No native install or device mutation is required for a read-only amount compatibility change.
- Perform rendered web checks at 390px, 768px and 1440px, plus 320px/reflow on new breakdown controls. Check accessibility, keyboard use, console/network errors and exact displayed totals against API evidence.
- Inspect final source diff and `git diff --check`; record exact checks, results, pre-existing failures, unrun checks and remaining limitations. Do not report partially verified work as complete.

## Parallelism and no-overlap rules

After the user chooses Mode A and T1 contracts are settled, T2, T3 and T4 may run in parallel with explicit file ownership. The primary agent handles T5 and contract coordination. Shared-file requests are returned to the primary agent; workers must not modify each other's assigned modules or revert unrelated edits. Agents are explicitly told they share the worktree.

Read-only baseline/audit questions may run independently only after Mode A is selected. Final integrity review follows completed writers; final verification follows review fixes. In Mode B, all tasks execute inline in this same dependency order without implementation subagents.

## Verification matrix

| Coverage | Required evidence |
| --- | --- |
| AC1: exact formula | Labour/Material with unequal margins and below/at/above thresholds, fractional quantities, per-scope paise rounding, configured zero, safe-range overflow; compare estimate selling and Procurement adjusted cost separately. |
| AC2–AC3: attribution | Two unequal projects, multiple rooms/Main Lines, same-target components, cross-basket targets, duplicate labels and reused component IDs; no dropped contribution or duplicate grand total. |
| AC4: invalid selection | Explicit subset, empty/duplicate/missing/archived component, missing costs, unavailable tier, legacy null target; no implicit all-components or stale fallback. |
| AC5: current state | Draft over active, quantity/dimension/tier changes, renamed target, changed UOM, concurrent save/config edit, stale fingerprint, out-of-order preview. |
| AC6: history/access | Published and approved snapshots unchanged, customer/PDF selling amounts exact, no cost-rule leakage, unauthorized/foreign-lead preview rejected, native/old-client no downgrade. |
| AC7: Procurement | Approved-estimate In-house condition, differing Procurement decision, current costs vs approved revenue/commitments, BOQ freshness and dispatch activation retained. |
| AC8: UI | In-house selection, breakdowns, switching modes, refresh, error/retry, manual labels, responsive layout, keyboard and accessible names. |
| User scope restriction | Before/after parity for PMC, Sub-Vendor, Standard automatic pricing, manual rates, excluded/legacy lines and approval/vendor flow state transitions. Component data present on a non-In-house line does not activate new behavior. |

Focused commands, executed later from their named workspace:

```sh
# backend
npm test -- tests/estimate-mode-pricing.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts tests/ai-estimator-knowledge-in-house-components.test.ts tests/project-assistant-pricing.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/ai-estimator-knowledge-in-house-components.replica-set.test.ts
npm test -- tests/procurement-basket-domain.test.ts tests/procurement-basket-mode-groups.test.ts tests/procurement-basket-mode-groups.replica-set.test.ts tests/project-purchase-order-mode.replica-set.test.ts tests/estimator-configured-procurement.test.ts
npm test -- tests/estimate-client-presentation.test.ts tests/estimate-publication.test.ts tests/estimate-pdf.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts

# frontend
npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/configuredEstimate.dimensions.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/EstimateInHouseComponents.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx
npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementBasketModeEditor.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx

# mobile
npm run typecheck
npm test -- --runInBand src/features/estimate-authoring/staffEstimateModel.test.ts src/features/estimate-authoring/staffEstimateApi.test.ts src/features/estimate-authoring/StaffEstimateWorkspace.test.tsx
npm run test:contracts
```

Run newly added focused preview/snapshot/breakdown tests alongside these existing suites. Use isolated synthetic Mongo replica sets for transactional tests, never production or seed scripts. Final backend/frontend checks are `npm run typecheck`, `npm test`, and `npm run build` in each workspace. Native export, when applicable: `npm run export:android`. Repository checks: `git diff --check` and `git status --short`. There is no lint script.

## Boundaries, stop conditions and delivery

No migration/backfill is planned. No commits, pushes, deployment, production writes, real customer messages or external delivery are authorized. Temporary fixtures, logs and screenshots belong in `/tmp/lisno-in-house-sub-basket-amounts/` and are not committed.

Return to the primary agent before changing another mode's formula/workflow, weakening an authorization or stale-version check, altering historical commercial source ownership, introducing a dependency or inventing an allocation for unavailable history. Resolve routine implementation details within the approved contract; seek user input only for a material change to that contract.

Final handoff identifies affected files, the In-house-only behavior, exact tests/builds/rendered checks, any remaining failures/limitations and temporary artifact paths. The specification, task plan and Mode A gates were completed before implementation.

## Execution evidence

The shared selling-only snapshot is mirrored between `shared/estimation/estimateComponentPricing.ts` and the backend domain; a parity test prevents drift. The preview performs no writes, and saves recompute/fence current source settings and require the matching fingerprint. Exact totals remain independent of a fabricated unit rate. Native preserves this basis read-only; frozen customer projections and PDFs use stored selling evidence.

The integration review found two Procurement reconciliation edges, both fixed and regression-tested: zero-approved-value lines are excluded according to existing actionable-line rules, and automatic Standard pricing continues to use its existing Sub-Vendor source. The new component breakdown follows the canonical current-cost source. No remaining confirmed findings were reported by the integrity reviewer.

The user-reported Render TS7006 failure at `backend/src/routes/estimates.ts:371` was reproduced locally. Giving the saved-line lookup callback an explicit `Record<string, unknown>` type fixed it; `npm run build` passed. Publication and PDF boundaries also reject malformed declared component snapshots even if a legacy unit rate is present.

Focused evidence, with logs under `/tmp/lisno-in-house-sub-basket-amounts/`:

- Catalogue/estimate replica suite: **71 passed**, including authorization, read-only preview, stale fingerprint, immutable snapshot and customer-safe projection tests.
- Tier and publication replica suites: **23 and 24 passed**; Procurement replica suites: **46 passed**.
- Component contract/publication/PDF tests: **10 passed**; Procurement domain suites after review fixes: **54 passed**; API docs/route registry: **111 passed**.
- Web product tests: **133 passed**, new enterprise interaction scenarios: **2 passed**, typecheck passed.
- Native authoring/customer tests: **57 passed**, typecheck passed, Android export passed. The two native operation/permission drift failures reproduce on the isolated initial revision and remain outside this change.
- Enterprise harness baseline at the exact initial revision: **60 passed, 3 failed**. Current harness: **62 passed, the same 3 failed**. These cover an old workflow-button expectation and duplicate Procurement gallery articles, not the new component scenarios.
- Final web suite, `npm test -- --maxWorkers=4`: **5,548 passed, 102 failed**, across 353 passing and 11 failing files. Every failing test name and count reproduces on the exact initial revision; the targeted baseline has 391 passing and 102 failing tests, while the same current files have 393 passing and 102 failing tests because of the two new passing interaction scenarios. `frontend-baseline-comparison.json` records the exact comparison and log paths.
- Final backend and web `npm run typecheck` and `npm run build`: **passed**. The web build retains existing large-chunk warnings; no dependency or bundle architecture change was introduced here.
- Final backend suite, `npm test -- --maxWorkers=4`: **6,362 passed, 20 failed, 24 skipped**, across 299 passing, 9 failing and 3 skipped files, in 497.03 seconds. Thirteen failures across seven files reproduce with identical names on the exact initial revision (`backend-baseline-failures.log`: 373 passed, 13 failed). Seven additional failures in the dashboard and assigned-project visibility suites began with five-second timeouts and cascaded; controlled runs of those two files with `--maxWorkers=1 --testTimeout=20000` passed **57/57 on both current and baseline revisions**. The original full-suite failures remain recorded, rather than counted as a clean full-suite pass.
- The 24 skipped backend tests belong to three Python assistant bridge/rules suites gated by an unavailable configured interpreter. Those checks were not executed. OCR/model tests and a full native suite were outside the changed slice; native focused checks, contract drift check, typecheck and Android export were run as planned. There is no repository lint script.
- Final `git diff --check`: **passed**. `git status --short` showed only the 14 remaining task paths, including this record. Complete final logs use the `final-` prefix under the evidence directory; controlled timeout results use `backend-late-`, and baseline comparisons use `frontend-baseline-comparison.json` and `backend-baseline-failures.log`.
- Rendered synthetic estimate and Procurement checks at **320, 390, 768 and 1440px**: no document overflow, no runtime errors after correcting the QA vendor fixture, no unexpected application API requests, exact amount reconciliation, working keyboard disclosures, quantity/mode changes, save, and failure/retry. No accessibility violations in changed content; two unchanged Procurement desktop sidebar links have contrast 4.43:1. Details and screenshots are in `browser-verification.json` and the adjacent PNGs.

No dependencies, lockfile changes, migrations, seeds, deployment, production mutation, commits, pushes or external delivery were performed by this task. Local Vite and browser QA sessions were stopped. Ignored build/export outputs and temporary test evidence are verification artifacts, not deliverables to commit.

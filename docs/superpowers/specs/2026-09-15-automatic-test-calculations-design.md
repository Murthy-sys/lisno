# Automatic test calculations

Status: specification and task plan approved; execution mode A selected. Implementation and integrated regression checks passed; final verification evidence is recorded in the task plan.

## Goal and scope

Calculate automatically when a test simulator opens with valid inputs and whenever the user changes a calculation input. Remove the need to click Calculate or Calculate total.

Assumption: the request applies consistently to the Mode test simulators: PMC, Sub-Vendor, individual Labor and Material, and Test In-house total. It changes temporary preview interaction, not saved Mode configuration or financial formulas.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationSimulator.tsx` submits `calculate(event)` from a form. Quantity, discount, editable In-house settings and basis changes call `clearResult()` but do not request a new preview. Its footer contains Calculate. Existing response-sequence guards ignore superseded responses.
- `KnowledgeModeCalculationEditor.tsx` captures configuration and margin snapshots when opening, and keys the simulator by scope/UOM identity and decimal precision. Closing/reopening resets temporary values. Preserve this behavior.
- `KnowledgeInHouseTotal.tsx` implements a separate combined simulator with Calculate total and similar manual request/sequence handling. `onResult` also updates the summary outside the panel; edits currently clear both copies.
- `knowledgeApi.ts:492` sends previews through the existing authenticated backend endpoint. The common API client supports AbortSignal and `showGlobalLoader`, but `previewKnowledge` currently exposes neither option. Requests default to the global loader, which should not activate repeatedly while typing.
- The shared simulator retains financial response guards and backend-provided integer-paise amounts. Sub-Vendor hides its vendor/balance row and retains Final total; PMC keeps its existing breakdown. These prior changes must remain.
- Regression consumers include `KnowledgePmcCalculationSimulator.test.tsx`, `KnowledgeSubVendorCalculationSimulator.test.tsx`, `KnowledgeModeCalculationEditor.test.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx` and `KnowledgeScreens.test.tsx`. Their manual-button expectations will need to follow automatic completion without weakening validation or stale-response checks.

## Proposed interaction

1. On opening, schedule one preview using the existing default quantity, discount and selected basis if all required inputs/configuration/UOM are valid.
2. After each relevant input or basis change, recalculate once after a **300 ms pause**. Restart that timer on another edit. This applies to quantity, discount, editable simulation rates/limits/markups and Min./Max. or Starting/Minimum basis selection. Read-only PMC/Sub-Vendor configuration fields remain read-only.
3. Immediately invalidate the previous result and error on an input change. Display a small inline “Updating calculation…” status during the pause and “Calculating…” while a request runs. Keep typing, radio selection and Close available; do not activate the global loader or move focus during automatic validation/results.
4. Remove Calculate and Calculate total from normal footers; keep Close. Add concise guidance that calculations update automatically. Enter must not reload the page, close the panel or create duplicate previews.
5. Incomplete or invalid input pauses calculation, clears outdated results and shows the applicable existing field guidance after the typing pause. Missing UOM or configuration retains its existing warning/recovery path. Correcting the input resumes automatically. Do not coerce blank/invalid values into a fabricated total.
6. A current backend/network/response-validation failure shows the existing error area and a **Retry calculation** action. Retry uses the current valid inputs without requiring an edit. Do not run an automatic retry loop. Editing after failure clears that error and schedules the new valid preview. Cancellation is not an error.
7. For the combined In-house simulator, clear the summary outside the panel when its inputs become outdated, and update both summary copies only from the latest accepted response. Preserve existing behavior that a successful temporary summary can remain after closing; a late response after close must not repopulate it.

## Request lifecycle and invariants

- Use the existing backend preview as the source of displayed amounts. Preserve all request shapes, financial units, selling-price/discount formulas, rounding, response validation, bounds and five-point margin rules.
- Pass optional cancellation/loading controls through the preview wrapper, preserving existing callers' behavior. Automatic simulator calls use an AbortController and `showGlobalLoader: false`; no broad API-client change is needed.
- Cancel scheduled timers and abort superseded in-flight requests on edit, close, unmount or context/UOM replacement. Retain a sequence/generation guard because cancellation alone cannot prevent an already resolved response from being applied.
- Only a response or error matching the latest input generation and mounted context can affect result, loading or summary state. A stale success/failure must not replace a newer response, clear its busy state, or leak into another Main Line/UOM/basis.
- Effect dependencies must be stable: no repeated calls from rendering, status changes, callback identity churn or React Strict Mode setup/cleanup. Rapid edits before the 300 ms pause should produce only the final eligible request.
- Preserve snapshot semantics: automatic previews use the configuration captured for the open simulator; reopening uses the current configuration. Do not silently start using background configuration updates in the open panel.
- No simulator edit or preview marks Mode configuration dirty or saves it. Existing combined summary state remains temporary. Authorization and backend routes remain unchanged.

## Data, compatibility and operational impact

This is a frontend interaction change with an optional frontend transport argument; no backend schema, endpoint payload, persistence, migration or permission change is required. API traffic changes from click-driven requests to debounced valid-input requests. Cancellation, the typing delay and absence of automatic retries bound unnecessary work. Existing API error handling remains authoritative; use current loading/error surfaces rather than new notifications or telemetry.

Rollback consists of reverting only the scoped interaction changes and tests, preserving earlier work. No application-data rollback is necessary. Do not add dependencies, stage, commit, push, deploy or mutate application data.

## Acceptance criteria and verification

- **AC1 — Automatic interaction:** all five simulator contexts calculate on valid opening and after supported edits/basis changes without a Calculate button. Rapid typing is debounced; no duplicate render/Enter/Strict Mode requests. Cover the 300 ms boundary with deterministic timer tests.
- **AC2 — Input and request safety:** invalid/empty fields and missing prerequisites send no preview, expose useful accessible guidance and clear stale results; valid correction resumes. Decimal precision, discount limits, margin rules and existing malformed-response rejection remain covered.
- **AC3 — Latest result wins:** exercise delayed successes and failures around rapid edits, invalid input, basis switches, closing/reopening and UOM/context replacement. Verify abort/timer cleanup plus sequence guards and that no obsolete response changes either combined summary.
- **AC4 — Failure recovery:** loading stays local and inputs/focus/Close remain usable. Current failures offer Retry calculation, use current valid values and do not retry automatically; aborted/stale errors remain silent. Verify the transport signal/loading options as well as rendered behavior.
- **AC5 — Financial and state preservation:** existing numeric regression examples still pass, including Sub-Vendor ₹15,000 at35% giving Final total₹23,076.92; previous Sub-Vendor summary removal and PMC presentation remain intact. Existing save/discard/temporary-snapshot behavior and combined total presentation remain covered.
- **AC6 — Integrated verification:** run affected simulator/editor/Mode lifecycle/workspace tests, relevant API transport tests, frontend typecheck and production build, and `git diff --check`. After writers finish, perform a focused integrity review and final verification. Browser-check automatic recalculation, focus, layout and loading/error recovery on desktop and mobile with synthetic local responses. Report tool timeouts and incomplete checks honestly; prior mobile screenshot attempts stalled waiting for fonts.

## Risks, constraints and open decisions

The principal risks are out-of-order responses, automatic effect loops, global-loader interference, error feedback interrupting typing and updating the external In-house summary with obsolete values. The request lifecycle above addresses them without changing finance logic.

The existing worktree has49 modified tracked files and ten earlier task documents. Capture the current target diffs/contents before any writer starts and preserve unrelated changes. The two simulator components have separate consumers; implementation ownership must explicitly separate shared lifecycle/transport work from each component and its tests.

No material product decision remains open: a short typing delay and consistent behavior across the related simulators are the recommended defaults. The repository workflow requires specification approval, then a separate task-plan approval and execution choice before implementation.

# Configuration currency crash and feature render recovery

Status: specification and task plan approved; Mode A selected. Implementation and focused verification are finished. See the task plan for evidence and the remaining installed-Android-app verification gap.

## Goal

Fix the reported mobile Configuration render failure while switching between Design and the newer tabs, and contain comparable feature rendering failures behind a recoverable screen.

## Confirmed evidence

- The user's screenshot reports `Cannot convert BigInt to number` at `shared/knowledge/knowledgePresentation.ts:65`, inside `KNOWLEDGE_INR_WHOLE.format(wholeRupees)`. `wholeRupees` is a BigInt.
- `shared/knowledge/knowledgeSavedSummary.ts` calls this formatter for configured mode prices. `mobile/src/features/knowledge/KnowledgeItemWorkspace.tsx` computes that saved summary during workspace rendering, including while other tabs are selected. The failure is therefore not limited to the Design editor itself.
- A temporary diagnostic using the real shared module and an Intl formatter that rejects BigInt reproduced the exact error for 0, 123456, and `Number.MAX_SAFE_INTEGER` paise. This simulates the device limitation; it is not a native-device test.
- The existing 65 Configuration tests passed both normally and with React Compiler enabled. A temporary test also completed 24 transitions through the real editors. Those Node-based checks support BigInt formatting and did not exercise this runtime incompatibility.
- The shared formatter validates nonnegative safe-integer paise before converting to BigInt. At the maximum accepted input, its whole-rupee quotient is 90071992547409 and its remainder is 91 paise. Converting that integer quotient to Number round-trips exactly.
- `frontend/src/features/ai-estimator-knowledge/knowledgePresentation.ts` re-exports the shared formatter; existing web tests cover exact INR output up to `Number.MAX_SAFE_INTEGER`.
- The mobile feature route renders `FeatureWorkspace` inside `AdaptiveAppScaffold` without a dedicated feature error boundary. Existing scaffold navigation-guard owners unregister on unmount.
- Current target files have no existing diff. Preserve prior environment, Gradle, splash, documentation, script, and runtime-log changes, including the already-dirty `mobile/.expo/dev/logs/start.log`.

## Requirements and recommended approach

1. Keep exact integer-paise validation and BigInt quotient/remainder arithmetic. Convert only the whole-rupee quotient to Number at the Intl formatting call. Preserve Indian grouping, the rupee symbol, and exactly two paise digits. This is safe across the existing accepted input range and avoids a new dependency.
2. Preserve rejection of negative, fractional, non-finite, and unsafe inputs. Do not substitute zero, silently round paise, modify business calculations, or change saved amounts.
3. Add a reusable mobile feature error boundary inside the existing scaffold around feature content. A child render failure shows a small, accessible recovery screen; the navigation shell and authenticated runtime remain mounted.
4. Provide an explicit retry and a working way to leave the failed screen. Retry remounts the feature and reloads through its existing read paths; it must not automatically replay writes, submit drafts, or claim that a pending save succeeded. Repeated failures return to the same fallback without an automatic retry loop.
5. Explain that unsaved screen changes may be lost when recovering. Do not display raw exceptions, stacks, tokens, API responses, or private record data. Do not introduce a remote logging service or suppress development diagnostics globally.
6. Reset recovery state appropriately when the feature/resource route or authenticated environment/session scope changes. Preserve authorization checks before rendering protected feature content. A failed feature must release its navigation guard so the user can leave.
7. Cover the device limitation explicitly in regression tests by making Intl reject BigInt arguments. Add a populated saved-summary fixture with nonzero paise and exercise Design/new-tab transitions under that condition.

## Scope, impacts, and constraints

- Shared change: `shared/knowledge/knowledgePresentation.ts`, with focused web/shared and mobile regression coverage.
- Mobile recovery: reusable boundary/fallback, `mobile/src/app/feature/[featureId].tsx`, and focused integration tests. Configuration remains the reported regression path; other feature screens gain the same render containment.
- API contracts, permissions, financial calculations, persistence, app identity, signing, release commands, and dependencies remain unchanged. No migration is needed.
- Error boundaries contain descendant React rendering/lifecycle failures. They do not solve native process termination, arbitrary asynchronous/event-handler exceptions, provider failures outside the boundary, or operating-system memory termination. This task does not claim universal crash protection.
- The confirmed root fix removes this specific error in development and release builds. Development tools may still surface diagnostics for deliberately injected errors; production recovery behavior must be checked separately from debug overlays.

## Acceptance criteria and verification

1. Formatting succeeds with an Intl implementation that rejects BigInt, including 0, 1, 99, 100, 101, 12345678, `Number.MAX_SAFE_INTEGER`, and nearby upper-bound values. Output retains exact paise and established Indian grouping. Invalid inputs remain rejected.
2. A realistic Configuration saved summary containing configured prices renders successfully while repeatedly switching through Design and Basket closure priority and back to other tabs under the restricted Intl behavior. Existing save/discard/conflict protections still pass.
3. A deliberately thrown child render error produces accessible recovery controls while scaffold navigation remains usable. Retry succeeds after the fault clears; persistent errors remain contained. Changed route/session scope starts fresh. Error text containing synthetic sensitive content never reaches the fallback UI.
4. Verify the fallback in a rendered mobile-size preview, including retry and navigation. Run focused formatter, Configuration, and boundary tests; mobile/frontend typechecks; an Android JS export; relevant web formatter/summary tests; and repository diff hygiene. Broaden only for a concrete regression or shared-contract concern.
5. Check on Android if a device/emulator is available, and report any missing native validation. Existing APK/AAB artifacts must be rebuilt to contain the fix; no publication or device installation is authorized by this specification alone.

## Risks, rollback, and open decisions

- Precision risk is controlled by converting only the already-bounded integer quotient and testing the maximum accepted paise value. A full amount conversion through fractional floating-point rupees is explicitly out of scope.
- Recovery can unmount an editor's local state. User-facing copy must disclose possible loss of unsaved edits, and retry must not trigger writes.
- The common formatter is consumed by web and mobile, so both consumers require focused verification.
- Rollback is limited to the formatter and recovery changes. There are no data or production mutations to undo.
- No open product choice is needed. The screenshot provides sufficient evidence to implement the root fix without requiring a device connection first.

## Reference

React's documented error-boundary behavior and limitations: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary

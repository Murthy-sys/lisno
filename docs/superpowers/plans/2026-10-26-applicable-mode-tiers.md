# Applicable Mode tiers implementation plan

Source: [specification](../specs/2026-10-26-applicable-mode-tiers-design.md).

1. Inspect Mode, section persistence, pricing consumers and proposal/native compatibility. Confirm empty new tiers. Complete.
2. Implement independent slices in `/tmp/lisno-mode-tiers` against clean Lisno HEAD `0753ad5a860fe543d72491bfdcb2328237e58435`:
   - Backend owner: scoped section APIs, namespace persistence/validation/reference traversal, shared API/types, OpenAPI and transactional regressions.
   - Frontend owner: Overview selection, dynamic tabs, scoped datasource/cache and pending guards, conflict/summary integration and focused tests.
   - Defaults owner: scoped sub-basket default reads and sidebar rendering, without changing index-level actions.
   - Integration owner: shared tier constants, docs, synthetic browser fixture, cross-layer review and final verification.
3. After writers finish, run integrity review for cross-tier preservation, immutable history and operational pricing. Run focused tests, backend/frontend typechecks and builds; resolve caused failures.
4. Render Configuration with synthetic local data; verify default Signature, enable Premium/Functional, empty initial values, independent save/reload, deselect/reselect preservation, unsaved guards, narrow layout and keyboard interactions.
5. Capture reviewed source manifest and hashes, apply only task files to Lisno using guarded copy with backups, verify destination bytes and `git diff --check`.

No production data mutation, migration, deployment, commit, push, dependency addition or unrelated redesign. Existing user authorization permits autonomous implementation; only filesystem permission boundaries require a tool approval.

## Verification results

- Frontend: 283 affected unit/component tests and five tier workspace integrations passed; standalone TypeScript and production build passed. The existing Screens/Layout suites have the same 20 failures reproduced against the original HEAD, with no new failure names.
- Backend: scoped tier persistence/domain/OpenAPI checks, 45 default-margin tests, and 97 reference/proposal/operational-pricing regression tests passed. TypeScript passed. Broad runs separately identified an existing Budget induction test and Procurement route expectation mismatch; these are outside the tier change.
- Synthetic browser verification used the actual Configuration page and in-memory fixture API, with no live data writes. Verified initial Signature-only selection, blank Premium/Functional inputs, Premium125 versus retained Signature75, save/reload, hide/reselect preservation, selected-tier summaries/defaults, desktop layout, 390px layout and keyboard focus. Runtime error counter remained zero.
- Browser QA caught and fixed empty PMC/Sub-vendor hidden compatibility fields blocking visible-cost saves. Visible inputs still start empty.
- Independent review covered namespace CAS preservation, legacy/native writes, retained component identities and reference guards, activation checks and unchanged operational pricing.
- The user's open Overview had unsaved edits; code was prepared and tested separately. User confirmed those edits were saved and it was safe to apply.
- No dependencies, production data migration, deployment, commit or push.

# Keep the existing In-house section visible

## Goal and evidence
Adding a component must retain the full existing In-house configuration so Super Admin can copy it onto a component and replace its scope and costs. The original section currently unmounts whenever inHouseComponents exists. Saved original values are materialized into a collapsed panel; entirely unconfigured originals are omitted. Null calculator defaults and missing checklist starter items also disappear. Pending legacy checklist names can be unmounted without joining the save guard.

## Contract
On the deliberate first Add, materialize a reserved existing-source component even when costs are null. Preserve stored costs exactly, retain absent scope starter options and explicit empty scope lists, and keep the original panel expanded by default through conversion and reload. Ordinary and preserved calculators share the existing presentation defaults; null costs remain null and cannot produce an estimate price. A reserved source with empty content may replace a destination with empty content. New ordinary blank components cannot act as copy sources. Copy scope, Labour and Material together, retain source and sibling contents, preserve destination identity, and retain current save, read-only, conflict and validation rules. Pending source inputs must be completed or cancelled before conversion. Explicit component arrays never reconstruct a missing source from obsolete root fields.

## Scope and verification
Reuse existing storage and copy behavior; no new API, price formula, financial values, dependencies, migration, deployment or production writes. No forced conversion on page load. Verify blank screenshot defaults, saved unequal costs, missing versus empty scopes, Add/reload visibility, empty and configured target overwrite, explicit-array no-fallback, source-input guards, read-only behavior and current save conflict tests. Run frontend component/transfer/Mode integration tests, backend shared-contract tests, type checks, production build and isolated browser QA where available.

## Execution
User autonomous instructions override repository approval gates. Use a fresh isolated snapshot and hash-checked delivery so existing work is preserved. Root owns runtime/shared code and integration; test agents own separate frontend and backend test files; fixture agent owns temporary browser-only files.

# In-house source removal plan

Implementation and verification complete. Delivery uses guarded copy, preserving existing project changes.

1. Read-only backend audit confirmed that individual source removal is supported, explicit arrays prevent fallback, and Save/CAS/conflict behavior remains unchanged. No backend change required. Existing estimates referencing a removed component retain their IDs and require deliberate reselection; no automatic ID remapping is introduced.
2. Added explicit Remove existing configuration, cleared deleted editor state, retained target/sibling data, and updated source guidance. Copying alone still retains the source.
3. Focused Components/Transfer/Mode pending suites pass67/67. Includes drag/copy then removal, exact target and sibling preservation, Save, Discard, read-only, pending-input cleanup, sole-source deletion with explicit[] and reload without stale-root resurrection. Frontend TypeScript and production build pass; existing chunk-size warning remains.
4. Isolated real ModePanel fixture on4195: remove original, Save, Reload -> one saved target remains; original absent; Labour45/Material95, unequal thresholds/impacts/margins and selected scope preserved; fixture errors0. Browser switched to user activity during screenshot capture, so no screenshot visual-pass claim. Temporary server stopped.
5. Reviewed delivery is one component file, two test files and two task documents. Apply only after matching original hashes, retain backups, byte-verify and check diff hygiene. No deployment, commit, migration or live-data mutation.

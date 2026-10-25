# Remove the copied original In-house configuration

## Goal and contract
Super Admin can explicitly remove the preserved original In-house section after copying it to a component. Copying still retains the source until Remove existing configuration is clicked. The action removes only the reserved source row, keeps all destination and sibling identities/scope/costs unchanged, and uses normal pending Mode save/discard behavior. It is also available for an unneeded empty source; no copy-history metadata or new approval dialog is introduced. Read-only views have no removal control. Explicit component arrays, including an empty array, prevent restoration from obsolete root fields after save/reload. Removal clears the deleted editor's pending/validation state and restores focus to Add component.

## Evidence and scope
The frontend deliberately hid Remove for the reserved source. Backend compatibility validation already supports individual component removal and preserves identity for retained rows; it disallows dropping the inHouseComponents field itself. Existing section and aggregate version checks, conflict rebasing, draft-only editing and audit behavior remain in force. No API, storage, pricing, dependency or production-data changes are needed.

## Acceptance and execution
Verify drag/copy followed by removal, target and sibling preservation, normal save payload, reload without resurrection, discard, pending-input cleanup and read-only access. Run focused rendered tests, production build and an isolated browser save/reload scenario. Work in a fresh temporary snapshot, preserve prior changes, and deliver using original-file hashes and backups. User autonomous instructions supersede default approval gates.

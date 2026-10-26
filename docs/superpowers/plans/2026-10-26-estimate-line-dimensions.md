# Mandatory estimate-line dimensions plan

Source: [specification](../specs/2026-10-26-estimate-line-dimensions-design.md).

1. Read-only backend/frontend/downstream audits and dirty-tree preservation: complete.
2. Calculation contract: complete. Always Length × Width; all three measurements required; configured area UOM supplies the input unit; Height is recorded only.
3. Domain calculation and Overview persistence: complete. Backend validation also covers proposal-local UOM edits. Shared parity, strict canonical measurements and one-step rounding verified.
4. Sales and narrow Client commands: complete. Source/rule expectations, estimate CAS, lifecycle and permission guards, retained manual rates, stale-price guidance, in-flight edits and source changes covered.
5. Frozen adapters/PDF and native/assistant compatibility: complete. Measurements retain their original rule; publication current-source validation added; unsupported native/assistant scalar edits blocked.
6. Verification: focused transactional, UI, precision, authorization, compatibility, typechecks and builds passed. Browser QA covers Overview, Sales and Client with local synthetic fixtures; desktop and 390px form checks passed. A tier-label CSS collision found at 390px was fixed, then Client measurements saved and reloaded as 32 sq-ft for 8 × 4 × 9 ft; Sales persisted 25 sq-ft for 12.5 × 2 × 10 ft. No runtime console errors observed.
7. Integration: guarded apply only task deltas to Lisno, preserve browser drafts, restart local source backend, verify hashes and diff hygiene.

Ownership: backend core agent owns calculation, Configuration, catalogue and Sales route; frontend agent owns estimate forms/state/API; downstream agent owns frozen snapshots/PDF, procurement, assistant and native compatibility; primary owns Overview UI, Client command, authorization/OpenAPI integration and final verification. Agents worked only in the isolated copy, with source files frozen before guarded integration.

Focused results (overlapping runs, not additive): backend core163, configuration2, proposal10; client command23 and broader authorization/API130; downstream245 plus integration110 and final publication52; frontend175 plus affected24; native71 plus final37. Final integrated Overview/payload/summary/conflict run: 109/109 passing. Backend and frontend production builds, backend/frontend/native typechecks passed. No repository lint script exists. Build outputs, fixtures and logs stay under `/tmp` and are excluded from delivery.

No dependencies, migrations, commits, pushes, deployment or live estimate changes are planned.

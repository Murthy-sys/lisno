# Move existing In-house configuration plan

Implementation and verification complete. Guarded five-file delivery preserves prior project changes.

1. Traced old copy behavior and confirmed existing conflict merge supports source deletion. The latest user request supersedes prior manual source removal semantics.
2. Root changed reserved-source transfer to one pending update containing target replacement and source removal; ordinary copies retain their source. Updated source guidance, move dialog and notice. Shared/back-end/API/storage contracts unchanged.
3. Focused Components/Transfer/Mode pending suites pass69/69. Tests cover click/drag/picker atomic payload, invalid/read-only/stale guards, target focus and pending cleanup, normal copy retention, failed Save retry, Discard, and conflicts where remote source changed plus unrelated siblings were added. Frontend TypeScript and production build pass; existing large-chunk warning remains. Independent read-only review found no actionable defects.
4. Isolated real ModePanel browser on4196 with source45/95 and different destination99/88: Use existing immediately removed source and replaced destination scopes/costs; Save persisted exactly one component; reload kept source absent and all copied values intact. Fixture errors0; desktop screenshot inspected. Native pointer drag is covered by rendered event tests rather than repeated manual automation. Current task QA tab and server closed; no live API called.
5. Delivery: one runtime component, two frontend test files, spec and plan. Original hashes must match; existing files are backed up and final copies byte-verified with diff hygiene. No deployment, commit, migration or production writes.

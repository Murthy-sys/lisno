# All selected estimate items in furniture measurements

## Goal and evidence
User reports selected items missing, clarifying Master Bedroom, and expects dimensions for all selected estimate items. The workflow adapter explicitly discards included=true lines with quantity=0. Estimate validation allows zero quantities and publication preserves those selections. This is a demonstrated omission; the live project's data has not been inspected. Room checkboxes otherwise filter only the frontend editor; both repositories supply every configured room from the pinned approved estimate.

## Decision and scope
Treat included=true as selection; include valid zero-quantity selected lines as reference items alongside positive-quantity lines. Keep the immutable approved quantity (including zero), exact room assignment, stable item identity and approved source/version checks. Negative/nonfinite quantities and malformed source remain rejected. Excluded lines remain excluded. Do not duplicate items into other rooms, use catalogue defaults, or substitute mutable estimate data.

Actual measurements remain positive dimensions or positive integer point counts, using configured UOMs and existing evidence and Client approval. No financial quantity/pricing change, schema change, dependency, new endpoint or production mutation. Previously accepted records remain immutable. A pending incomplete submission cannot be approved against an expanded canonical source; preserve the existing safe return/revise path and explain/test this compatibility effect. If review identifies a larger compatibility issue, resolve before implementation completion.

Compatibility audit found combined Client send-back currently requires complete canonical coverage, which would strand a prior pending submission that omitted zero-quantity lines. Relax completeness only for send-back: the submitted IDs must still be a unique valid subset of the same approved room, with matching canonical names and room identity. Keep exact event token, immutable event/current-value equality, pending status, source version, role, reason, CAS and representative-proof guards. Approval and every new upload still require complete coverage. Already approved historical records/readiness remain unchanged.

OpenAPI must describe the estimate reference quantity as nonnegative (minimum 0), while actual measurements and point-count constraints remain strictly positive. Root owns this shared documentation contract and its API-doc regression.

## Acceptance
- Living & Dining, Master Bedroom and Kitchen each return only their included approved items, including a room whose selected items all have quantity zero; excluded items never appear.
- Stable IDs and legacy snapshot indexes remain unchanged across zero/excluded lines, in memory and Mongo.
- Checking each room displays all its item fields and zero estimate quantity is displayed as the unmodified reference, never used as actual measurements.
- Complete measurement submission works for all selected rooms; omission of a selected zero-quantity line is rejected. Source/CAS/UOM/proof/Client review requirements remain enforced.
- Existing approved history is retained and pending incomplete records cannot bypass updated canonical validation.

## Execution and verification
Standing autonomous Mode A applies; no repeated approval gates. Backend writer owns the shared adapter and backend focused regressions. Root owns frontend regression, browser integration and documents. Independent read-only compatibility review runs alongside implementation, then final integrated review and verification. Focused domain/workflow/replica regressions, both typechecks/builds as appropriate, rendered all-room selection and submission, and baseline-preservation diff-check. No live data inspection or deployment claim.

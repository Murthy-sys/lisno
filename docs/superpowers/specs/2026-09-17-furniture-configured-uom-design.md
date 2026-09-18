# Configured reusable UOM for furniture dimensions

## Goal and authority
Use Configuration's reusable UOM catalog for furniture measurements and allow an eligible uploader to add a missing UOM here for future projects. Standing autonomous Mode A applies. Local implementation/verification only; no deployment, production mutation or backfill.

## Evidence and choice
Furniture dimensions currently use a hardcoded mm/cm/m/in/ft enum. Configuration uses the global AiEstimatorKnowledgeUom model with stable IDs, normalized unique code/name, quantity decimalScale (0–3), lifecycle/version/dependency epoch and audit. Generic Configuration mutation is sole-active-Super-Admin-only. Procurement vendor creation establishes a narrow transactional create-or-reuse pattern for another workflow. Reuse the UOM master and its validation/order/audit primitives through a bounded project API; do not grant Configuration-wide access or impersonate a Super Admin.

## Contract and behavior
- GET/POST `/projects/:projectId/design-workflow/furniture-uoms`. Project read/act route authorization plus current furniture uploader capability: assigned/initiating Designer, linked Client or existing Client-capable representative. Other managers, Finance and unrelated users cannot create UOMs. Recheck identity/project authority inside write transactions. Creation also requires a currently available furniture upload/correction action.
- GET returns active options `{id,code,name,decimalScale}` in Configuration display order. POST input `{code,name,decimalScale}` (0–3, default 3); create in the existing master, or reuse an exact normalized active code/name match without changing its definition. Partial identity conflicts or inactive matches fail with actionable messages. Archived identities follow Configuration’s existing policy and may be recreated under a new stable ID. Atomic audit records actual actor and project origin. New units remain reusable even if the furniture form is later cancelled.
- New furniture item input uses `uomId` instead of an arbitrary `unit` string. Save stable `uomId`, immutable `unit` code and `uomName` alongside dimensions. Existing unit-string history stays readable; no implicit name/code matching to IDs.
- New and corrected submissions resolve active UOMs and increment dependency epochs in the same workflow transaction. Preserve CAS, idempotency, proof cleanup and audit; race with catalog lifecycle must not admit a deactivated reference.
- Approval/review/history uses submitted snapshots, so later rename/archive does not relabel a measurement or invalidate review. Returned drafts retain IDs; if unavailable, show prior unit and require an active replacement. Legacy string-only drafts require explicit configured selection. No unit conversion, quantity calculation or rounding.
- Configured decimalScale remains estimator quantity precision, not a cap on actual L/W/H measurement accuracy. Measurements stay positive finite numbers. No authoritative length/area/count classification exists; do not infer eligibility from code/name.
- Account for furniture references in existing UOM lifecycle/dependency rules where needed; preserve historical evidence on every decision.

## UI
Keep the compact panel. Each item has a required configured UOM selector with loading/error/retry/unavailable states and a small Add UOM action. Add opens a compact nested panel with code, name and quantity decimal places, using existing field/overlay controls and dirty/busy protections. Saving selects the new/reused unit only for the initiating item, preserves entered dimensions, updates all UOM options and refreshes Configuration/procurement caches. No polling or per-item network fan-out; share one project UOM query.

## Acceptance criteria
1. Only configured active UOMs can be used for new submissions, validated by ID on server.
2. Missing UOM can be added here and appears in Configuration and another project; duplicate/race behavior does not create duplicate masters or audits.
3. Only eligible project uploaders can use the new write route; generic Configuration permissions remain unchanged.
4. Catalog rename/archive and stale selections preserve old snapshots and reject unavailable new selections; failed actions roll back reference changes and clean proof.
5. Add/cancel/retry/loading/dirty/busy and returned/legacy unit states preserve the measurement draft; keyboard/mobile/desktop remain usable.
6. Memory/Mongo behavior, route registry/OpenAPI, relevant reference lifecycle and existing furniture approval/estimate-item gates stay aligned.

## Verification and risks
Focused UOM source/create/normalization/permissions/reference race tests plus replica-set workflow/config integration; frontend UOM add/selection/failure/draft tests; typechecks/builds; rendered mobile/desktop interactions and axe; final integrity review and hygiene. Main risk is allowing global metadata creation through project authority: constrain fields/actions to UOM creation and do not expose generic admin APIs. No schema migration or new dependency expected. Deploy frontend/backend together after separate authorization.

# Selected-tier specification fallback to Mode

Date: 2026-11-16
Status: Approved and implemented in Mode A; verified with the known pre-existing API-documentation test failure recorded in the task plan

## Goal

Show the selected tier's configured specification names and brands in **Show details of tier**. When that tier has no specifications, use the saved **Mode (default)** specifications from the same current Main Line revision. Apply this to both the estimator and Configuration's **Client view**, preserving the existing styling.

The user explicitly selected: **Use Mode specifications when the tier has none**. This replaces the previous feature's prohibition on using default Mode for missing tier details. It does not change pricing fallback rules.

## Current behavior and evidence

- The local backend had been started before the tier-details implementation. Its served `/openapi.json` did not include `EstimatorCatalogueTierDetails`, explaining why the updated frontend could show unavailable metadata. The existing local development launcher has now been restarted without seeding; the served schema includes tier details.
- Read-only inspection of the reported **POP false ceiling** Main Line in the configured loopback development database found two specifications and two brands in `pricing.payload.tierConfigurations.default.payload`, a configured but empty Signature specification list, and no Premium or Functional pricing-detail payloads. All three tiers are applicable. This record currently uses its active revision and has no draft.
- The Configuration scope mapping is correct: primary Mode uses `default`, Signature uses the root pricing payload, and Premium/Functional use their own namespaces. Four-scope datasource/navigation checks passed (14 datasource tests and two targeted navigation/save tests).
- `backend/src/domain/estimator-tier-details.ts` currently projects only the requested tier. `estimator-catalogue.service.ts` supplies that result in `tierDetails`; both frontend consumers already display the exact selected entry.
- A separate legacy applicability issue was reproduced in investigation, but it is not the cause of this record: its Signature pricing section is already configured. Changing Configuration save flags is outside this correction.

## Required behavior

1. For each applicable Signature/Premium/Functional tier, prefer its valid, configured, nonempty specification list.
2. If the selected tier has no specifications because its namespace/list is absent or its valid list is empty, use the valid, configured default Mode list from the same verified Main Line and current revision.
3. Choose a complete list from one scope. Do not merge lists, fill individual missing brands from another scope, or resolve brand IDs across scopes. For example, a Signature specification referencing brand ID `b1` must use Signature's `b1`; a fallback Mode specification uses Mode's `b1`.
4. Malformed or ambiguous selected-tier data remains unavailable. An explicitly disabled/unconfigured tier payload containing retained specifications must not be misrepresented as an empty list. Missing source identity, incompatible current source, or an unverified revision must never trigger fallback to another Main Line or historical revision.
5. If no safe Mode fallback exists, preserve the existing configured-empty or unavailable feedback. Missing/ambiguous brand names continue to display **Brand unavailable**; unassociated specifications omit brackets.
6. Keep the visible title **Show details of tier** and content **Specification name (Brand names)**. Do not add description paragraphs, configuration metadata, prices, or new controls. Keep local expansion, keyboard access, tier switching, inclusion, quantity, and rate behavior unchanged.

## Integration and boundaries

Resolve fallback in the existing backend catalogue projection so the estimator and Client view receive the same result. Retain the existing optional `tierDetails` DTO shape and safe name/ID/brand whitelist; the selected-tier entries will contain the resolved display list. Document the new resolution rule in OpenAPI and relevant type comments.

Use the existing latest-saved-draft-otherwise-active source resolver. Default Mode must come from that exact revision, including when the revision has no selected-tier details. Project only tiers that are applicable to the Main Line. No extra endpoint or fetch on expansion is needed.

This is read-only descriptive behavior. Do not copy or move stored specifications, rewrite section applicability, change pricing eligibility or rates, mutate estimate drafts, alter dirty fingerprints, or change approved/published data. No database migration, seed, dependency, authorization change, or production deployment is required. All unrelated dirty work must be preserved.

## Risks and verification

The principal risks are borrowing the wrong scope's brands, falling back despite malformed selected-tier data, and applying descriptive fallback to financial values. Cover them with unequal Main Lines, unequal tier/default lists, reused local brand IDs, empty and absent scopes, invalid associations, and private-field sentinels.

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | A valid nonempty tier list takes priority over default Mode. | Helper and catalogue integration cases with different names/brands per scope. |
| AC2 | Empty/missing tier lists use valid saved Mode specifications from the same current revision. | Signature/Premium/Functional cases; actual Mongo projection; draft precedence. |
| AC3 | Malformed, incompatible, or absent sources cannot silently borrow unrelated values. | Invalid selected/default payloads, missing source, repeated local IDs, absent/empty fallback states. |
| AC4 | Estimator and Client view display the resolved names/brands while preserving styling and interaction. | Focused rendered consumer checks and a local browser inspection, including tier switching. |
| AC5 | Prices, inclusion, quantity, persistence, and private-field boundaries remain unchanged. | Catalogue price regression, no-write/fingerprint assertions, explicit response whitelist. |
| AC6 | The integrated correction compiles and preserves existing work. | Relevant focused tests, typechecks/builds, `git diff --check`, preservation comparison. |

The existing API-documentation suite has an unrelated baseline failure concerning Configuration's four-scope enum; keep it separately identified if it remains. Full unrelated suites are not required for this bounded correction.

## Assumptions, rollback, and open decisions

The confirmed fallback preference applies equally to all three estimation tiers and both views. It is list-level fallback only; tier-specific data is never overwritten. There are no open product decisions. Rollback is a code revert with no data repair.

Diagnostic artifacts and preservation snapshots are under `/tmp/lisno-tier-mapping-fix-qa`. No product sources were changed during diagnosis. A separate implementation task plan follows approval of this changed specification, per the repository workflow.

# Estimator tier selection and Main Line recommendations

Date: 2026-11-16
Status: Implemented and locally verified in approved Mode A

## Goal

In the editable estimator, switching PMC on or off must not prevent choosing another applicable configured tier. Recommendations must continue to come from the selected Main Line's saved Configuration across Signature, Premium and Functional. Preserve existing styling and recommendation rules.

## Current behavior and verified evidence

- `ConfiguredEstimateBuilder.tsx` builds tier radio disabled states using `configuredTierUnavailableReason(line, tier, referenceMode)`. PMC off normally selects Sub-vendor as the pricing method. Both `LeadEstimateWorkspace.tsx` and `updateConfiguredLinePricing` repeat the same price-based selection guard.
- Read-only inspection of the local POP false ceiling configuration confirmed all three tiers are applicable. Signature has PMC ₹90 and Sub-vendor ₹101.25; Premium has PMC ₹240 and no Sub-vendor price; Functional has PMC ₹360 and no Sub-vendor price. This explains the disabled Premium/Functional choices with PMC off. It is not caused by the description editor.
- The Main Line still has two required addition rules, for False Ceiling Functional Lights and False Ceiling Painting. The inspected target revisions do not have usable named-tier rates. The recommendation data was not removed.
- Recommendation source fetching already uses stable Main Line IDs and current source revisions, independent of source tier or PMC. Editable catalogue refreshes already update current source versions; historical versions intentionally remain separate. Do not change this without a reproduced defect.
- Target eligibility currently requires usable Sub-vendor pricing in both `readEstimatorCatalogueRecommendations` and `buildRoomRecommendations`. Unavailable direct targets and group children are omitted from the rendered recommendation lines. Group responses can contain only an unavailable count when children are filtered out.
- Existing estimator behavior displays required additions, not optional additions, removals or free-text guidance. The user's statement that recommendation behavior is unchanged is interpreted as preserving that policy.
- Initial local inspection was read-only. Backend/OCR services remain stopped, as requested. Implementation changes application code only; stored configuration is unchanged.

## Required behavior and acceptance criteria

1. **Independent selection:** Applicable configured tiers remain selectable in an editable current estimator line whether PMC is on or off. Continue to block changes for read-only stages, unavailable current sources and stale/loading configuration. Tiers explicitly excluded in Overview remain unavailable.
2. **Honest prices:** Changing tier retains the chosen pricing method. Resolve only that exact tier/method's configured price. When unavailable, show Pending/configured-price-unavailable and keep existing incomplete-price save/submission guards. Never copy a PMC price to Sub-vendor, borrow another tier's price, silently change method or substitute zero.
3. **Stable recommendations:** For the same included Main Line and current configuration revision, the same configured required recommendation set remains visible across all three tiers and PMC on/off. Quantity, pricing method and selected tier must not redefine the recommendation rules.
4. **Visible incomplete targets:** A configured required target remains visible with an explicit unavailable/incomplete-price state even when it cannot yet be added. Keep Add disabled until existing valid-price/current-source requirements are satisfied. Preserve warnings and prevent false completion when required targets remain unavailable. A Sub Basket with no usable children must remain represented rather than disappearing.
5. **Authorized identity:** Use stable target IDs and server-verified display labels. Where current response fields omit unavailable children or names, extend only the read response with optional display/status metadata. Do not manufacture targets in the frontend, expose private configuration fields or bypass source/target authorization. Missing, archived or inaccessible targets must not be represented as valid choices.
6. **Preservation:** Preserve required/optional/removal policy, recommendation provenance and deduplication, room/Main Line isolation, source revision checks, existing Add/Remove behavior for valid targets, integer-paise calculation, published/approved snapshots and the recently fixed descriptions/Client preview. Opening or switching tier does not rewrite shared Configuration.
7. **UI:** Reuse the current tier controls and recommendation panel. Show visible, accessible reasons for unavailable pricing; keep keyboard selection and narrow-screen behavior intact.

## Scope and approach

Separate three decisions: choosing an applicable tier, displaying a configured recommendation, and allowing a correctly priced item to be added/saved. Reuse existing pricing validation for the last decision.

Expected affected areas are estimator tier controls and draft update guards; recommendation view shaping/presentation; and, only where unavailable target display requires it, the existing backend recommendation read response and aligned frontend types. No new persistence schema, endpoint or dependency is expected. Preserve shared Client recommendation behavior unless a demonstrated shared-contract change requires compatible handling.

The alternative of filling in missing Sub-vendor prices would change Configuration data and cannot be inferred from the requested UI behavior. It is outside this fix. Switching PMC on automatically would also change the user's chosen pricing method and is excluded.

## Data, compatibility and failure behavior

- Current internal reads retain the latest saved draft/active revision selection and stable Main Line identity. Approved and issued amounts are immutable.
- Existing scoped authorization and version/CAS checks remain authoritative. Any optional response metadata must be compatible with older consumers and carry no new financial authority.
- Loading, error, forbidden and stale states remain explicit. A failed recommendation read cannot be presented as an empty successful list or as completed required work.
- No backfill, migration, data repair, seed or service restart. Rollback is limited to the bounded code changes; stored data is unchanged.

## Verification

- Rendered tier tests: all applicable tiers with PMC on/off; missing selected-method rate; valid rates; non-applicable tiers; locked/historical/stale lines; no automatic method change or borrowed/zero price.
- Workspace/pricing tests: identical guard behavior in the row, mutation handler and draft reducer; incomplete amounts remain blocked from save/submission; valid selection adopts only its configured rate.
- Recommendation tests: identical source rules across three tiers and two PMC states; unpriced direct targets, empty/unpriced Sub Basket children, mixed available/unavailable targets, unchanged required/optional policy, current/historical source separation and two unequal Main Lines/rooms.
- If backend read metadata changes, focused catalogue recommendation replica-set tests verify authorized labels/status and existing add eligibility. No write migration is involved.
- Focused frontend suites, typecheck/build and desktop/mobile synthetic browser checks; backend typecheck/build and focused tests if changed; `git diff --check` and baseline comparison. Keep backend/OCR services stopped and use isolated test infrastructure as needed.

## Risks, assumptions and open decisions

The principal risk is accidentally treating a selectable tier or visible recommendation as permission to save an unpriced amount. Keeping selection/display separate from existing price validation is required. Another risk is stale or unauthorized target naming; resolve display metadata on the established authorized read path.

Assumption: “no change in recommendations” preserves the current required-addition policy and asks for consistent visibility across tiers, rather than adding optional/removal/guidance workflows. No other product decision is currently needed. This specification does not authorize deployment, live configuration edits or service restarts.

## Verified outcome

All seven acceptance criteria are covered by the implementation and focused verification recorded in the [task plan](../plans/2026-11-16-estimator-tier-selection-main-line-recommendations.md). Applicable tiers remain selectable with PMC on/off; unavailable exact tier/method prices clear the rate and block saving/submission. Required Main Line recommendations remain visible, with unavailable targets disabled and valid targets retaining Add/Remove behavior.

The integrated run passed 225 frontend tests, 13 isolated backend replica-set tests and one focused API documentation test. Both workspaces passed typecheck/build. Synthetic desktop/mobile browser interaction passed with no application errors, accessibility violations or writes. Backend/OCR services remain stopped; running-application verification against the backend was not performed.

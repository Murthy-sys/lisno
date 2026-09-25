# Mobile Projects reference redesign

## Goal and authority

Update the mobile Projects workspace to the supplied architectural cream/forest reference. The user's continuing autonomous-execution waiver and Mode A apply. Preserve unrelated dirty dashboard, entry and navigation work captured in `/tmp/lisno-mobile-projects-reference-20260924`.

## Current evidence

Projects uses `GenericFeatureWorkspace` with a basic heading, creation button and record rows. Existing role-specific endpoints are `/admin/projects`, `/projects` and `/client/project-summaries`; each accepts pagination only, up to 100 records. List summaries provide lifecycle status but no project image or authoritative three-stage construction phase. Admin summaries expose propertyType and createdAt; nonadmin records expose updatedAt but no propertyType. Current Super Admin initiation sends salesManagerId, which the backend rejects for that role; the existing web flow uses estimatorId instead.

## Requirements and decisions

1. Dedicated Projects workspace with a decorative architectural hero, Projects heading, existing visibility explanation, green initiation panel, four-part status summary, status filter and compact project cards matching the reference. Keep shared app chrome and existing Back navigation.
2. Use current Poppins/Fraunces typography and cream/forest tokens. Native controls remain accessible, at least 44 points, and readable with long names, enlarged text and tablet width.
3. Preserve session-scoped query keys, existing operation checks, authorized endpoints, stable project IDs and detail routing. Retain existing creation forms and invalidation. Correct only the proven initiation assignee mismatch for admin/super_admin; backend authority remains unchanged.
4. Paginate rather than silently dropping projects. Total projects comes from server pagination. Status filters and status counts operate on loaded records and are explicitly labeled as such while more pages remain. Load more stays available for filtered and empty views. Counts become complete after all pages load.
5. Status and property labels come from source fields. Thumbnail is a clearly marked no-photo architectural placeholder until the API supplies real media. Three-stage reference track stays neutral with an explicit phase-unavailable label when no authoritative phase exists. Do not infer construction phases from lifecycle active or design-task progress. Show Updated only from updatedAt; otherwise show Created from createdAt or omit.
6. Preserve loading, empty, denied, retry, stale/refetch-error and pagination-error states. No new dependencies, backend schema/API changes, production writes, migration, commit or deployment.

## Risks and verification

Counters must never imply unloaded status totals; filtering must never hide load-more. Role changes must isolate cached records. Hero artwork is decorative and must not be represented as a real project photo. Regression tests cover different identities/endpoints, asymmetric lifecycle counts, missing metadata, filter/reset/pagination/retry, exact detail IDs, create permissions and corrected initiation payload. Native Android visual/interaction checks cover the real list and enlarged text; export and typecheck verify integration. Record unrun iOS/tablet checks.

## Delivered

Dedicated Projects workspace and styled initiation flow implemented, with paginated role-scoped data, reference-based cards/counters/filter, decorative architectural hero and explicit unavailable photo/phase metadata. Independent review finding about changing pagination totals resolved. Android appearance, filters, creation cancellation, detail/Back and enlarged-text checks passed. Exact verification and remaining platform limits are recorded in the [task plan](../plans/2026-09-24-mobile-projects-reference.md).

## Reference correction

The user's follow-up identifies the second supplied crop as the exact visual target. Correct the header into one continuous architectural canvas behind Back, Projects and description; remove the separate plain Back strip. Use a single slender arch, olive planter/steps and small handwritten “Spaces / People / Progress” at the right. Match the approximately 170-point header and 60-point initiation action at normal phone text size, allowing natural expansion for enlarged text. Keep Back's existing route policy/blocked state and preserve all project data/forms/filtering. The shared application brand header and bottom navigation remain unchanged. New matching artwork is saved as a sibling asset to preserve the original.

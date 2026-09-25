# Projects reference layout

Date: 2026-09-25. Execution authorized by the user's instruction to continue, implement, and not wait for further approvals; prior Mode A continues.

## Goal and current evidence

Match the supplied All Projects reference with a warm interior header, image-topped compact cards, status navigation, layout toggle, sorting and filters. Each card has one single-line project title, client and city together, then property type and cost together. The user repeated “project name” for the final row; the optional clarification offered property type as shown in the reference, and that is the stated default pending correction.

Current `AdminProjectsPage.tsx` has a four-column image grid, list toggle, paginated fetching, initiation and permission-controlled designer assignment. Cards currently stack metadata and extra workflow/avatar details. `AdminProjectSummary` already contains name, client.name, location, propertyType and estimate. There is no project-photo field; the current default interior image is decorative. Existing estimate presentation uses approvedBaseline.total after client approval and explicitly identifies unapproved estimate values, in rupees. Do not change that lineage or substitute budget values.

List API currently accepts only limit/offset, and both memory and Mongo implementations scope records by the authenticated actor. Status tabs/counts/search/sort require server-side selection so later pages and authorization remain correct.

## Requirements and acceptance criteria

1. Warm, readable interior image at the Projects header; restrained olive controls and existing typography; compact cards, no extra visual effects. Preserve Configuration styling and other routes.
2. Cards: decorative image with status overlay; single-line title with full accessible text; client/city in one row; property type/cost in the next. Long content truncates safely while full text remains accessible. Cost may wrap when necessary for legibility. No extra avatar/stage rows. Keep designer-assignment action when authorized and pending.
3. Preserve estimate semantics in both layouts: approved baseline only for approved estimates; draft/current status remains visible; no estimate and missing baseline states are explicit. Zero values remain zero. No calculation or unit conversion introduced.
4. Working status controls All/Active/Planning/On Hold/Completed, grid/list persistence, Sort (newest, name ascending/descending), and Filter disclosure with project/client/city search. Search is literal and case-insensitive. Selection resets offset, filtering occurs before pagination. Counts are scoped/search-matching totals before status selection. A stale page must not look current or enable stale quick view.
5. Preserve authorization, backend module scope, existing detail links/quick view/initiation, encoded IDs, pagination and errors/retry. Do not introduce arbitrary mutations or dead controls. Filtered empty state retains usable controls/reset.
6. Responsive from 320px through 1920px, readable image overlay, keyboard focus, named controls, 44px interactive targets, reduced-motion handling and no horizontal page overflow. Verify actual rendered layout and accessibility.

## Contract, scope and risks

`AdminProjectListInput` extends pagination with optional status (`planning`, `active`, `on_hold`, `completed`), search (trimmed maximum 120 characters), sort (`newest`, `name_asc`, `name_desc`; default newest). `AdminProjectPage` adds statusCounts `{ all, planning, active, on_hold, completed }`; pagination.total includes selected status and search, counts include search but not selected status. Frontend tolerates absent counts during backend-first rollout without fabricating status totals.

Extend existing repository list paths, preserving source summary loading and Mongo access predicates. Compose search with existing authorization rather than replacing its `$or`. Stable name ordering and ID tie-break must match memory/Mongo. Update runtime validation and OpenAPI; no new endpoint or permission. No schema, data migration, writes or financial computation. Newest keeps existing created-at ordering with stable tie-break. Requests are read-only; query keys include all filters.

Settled ordering: case-insensitive English `Intl.Collator` with significant accents and non-numeric ordering, then exact binary ID ascending. Newest uses created-at descending then binary ID descending. Mongo name sorting reads only authorized matching name/ID metadata, sorts and slices it, then hydrates the selected page with binary scope checks. Applying locale collation directly to authorization predicates would weaken exact ID matching, so all Mongo predicates retain simple/binary collation. Name-sort memory use therefore scales with the number of authorized matches; newest retains database pagination. No financial summary is loaded for off-page name-sort results.

Reuse the existing local interior asset as a clearly decorative default and header image. Do not invent project-specific photos, staff or amounts. No asset generation or new dependencies required. No real account/project data needed for QA.

Non-goals: photo upload, lifecycle editing, delete menu, finance redesign, project detail redesign, production rollout. Use existing functional actions rather than copying a nonfunctional screenshot menu.

Rollback is reverting this task's scoped changes. Deploy backend before frontend. Temporary synthetic browser fixtures and logs stay outside tracked sources. Existing dirty work must be preserved, including concurrent Configuration changes.

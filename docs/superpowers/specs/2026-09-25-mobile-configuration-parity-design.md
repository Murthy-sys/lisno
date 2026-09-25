# Mobile Configuration parity

## Goal and authority

Rename the mobile navigation entry to Configuration and implement the functionality available in the current frontend Configuration workspace, adapted to native phone/tablet controls. The user's instruction to check and implement, standing approval waiver and Mode A authorize execution without repeating gates.

## Evidence

At baseline a57916a the worktree is clean. `mobile/src/features/knowledge/KnowledgeCatalogWorkspace.tsx` only offers catalog search/pagination, normal creation, detail/history, duplicate, activation and deactivation. There are no section editors, management screens or calculation previews. `mobile/src/navigation/registry.ts` owns the old label. The frontend source is `frontend/src/features/ai-estimator-knowledge`.

## Scope and acceptance

1. Configuration is the consistent mobile navigation/fallback title; route and permissions remain stable.
2. Catalog: basket grouping, search/filter, normal and temporary items, Main Basket/Sub-Basket management, reusable values, correct pagination, lifecycle and confirmed deletion workflows matching backend capabilities.
3. Item workspace: Overview, Mode, Recommendation & Exclusions, Quality Parameter, completeness, revision history and real saved summary. Phone layout uses scrolling tabs and stacked sections.
4. Overview: inherited UOM selection/quick creation and Surface selection/creation/edit/removal.
5. Mode: PMC, Sub-Vendor and In-house, shared description, inclusions/exclusions, correct independent rate/margin controls, read-only inherited UOM, temporary server calculation simulators and specifications/brands. Preserve legacy records and hidden mode data.
6. Recommendations: current priority, main-line/sub-basket add/remove rules, exclusions and budget alterations, stable relationship IDs, unavailable reference states.
7. Quality: basket-shared checklist, full parameter/check/evidence/severity/frequency/performer options, import review and template/saved export, reusable option creation when allowed.
8. Save captures section and aggregate versions; Mode's advanced and pricing saves serialize against returned aggregate versions. Failed/conflicting saves retain drafts and never silently overwrite. Pending changes protect tab/back/navigation. Active history is immutable except independently editable basket Quality.
9. Every request uses existing authenticated runtime and environment/user scoped query keys; permission plus allowedActions gates remain authoritative. Quality uses configuration.update plus item/basket not archived, independent of selected revision.
10. Native rendered tests, asymmetric calculations and conflict/permission tests, mobile typecheck/Android bundle export, shared-helper frontend regressions and build, proportionate native visual QA.

## Architecture and invariants

Use native React Native screens and the existing authenticated transport. Extract browser-independent frontend API shapes/builders and validation/presentation modules into `shared/knowledge`, keeping frontend import paths as re-exports. Both clients then use identical paise/basis-point conversion, parsing and validation; no duplicated financial formula. Preserve all unknown payload fields on changes. Mobile query caches remain session/environment fenced. Server preview endpoints own calculation results. Excel parsing may add the same existing frontend library to mobile if required, with bounded local files and no automatic upload or save.

No backend contract, permission expansion, production mutation, seed, migration, deployment, commit or push is authorized. Desktop styling and functionality remain unchanged. Local synthetic fixtures and ignored build artifacts are allowed.

## Risks and verification

Highest risks are version conflicts, multi-section partial saves, mode visibility dropping data, shared Quality versus revision editing, calculation units, stale session responses, incomplete paged catalogs and file parsing. Test these explicitly. Preserve drafts after recoverable failures, disable writes when references cannot be safely resolved, and keep retries explicit. Independent review precedes final verification. Document any unsupported feature or unverified platform honestly instead of declaring complete parity.

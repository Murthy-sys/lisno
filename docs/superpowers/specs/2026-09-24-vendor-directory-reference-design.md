# Vendor directory: screenshot reference

Date: 2026-09-24
Status: Approved; Mode A implementation and scoped verification complete. See the [completed task plan](../plans/2026-09-24-vendor-directory-reference.md).
Reference: User-provided Vendor directory screenshot in this conversation.
User requirement: Match the supplied screen when entering the Super Admin vendor directory; Vendor KPI remains **Not available**.

## Goal

Recreate the reference's composition in the existing Super Admin Procurement screen: interior-image header, large serif title, four summary tiles, configured-vendor workspace, aligned filters, detailed vendor rows, numbered pagination, and a quiet performance notice. Preserve the working vendor editor, both Execution Type checkboxes, shared Main/Sub Baskets, permissions and archive workflow.

This is a directory redesign, not a redesign of the vendor-entry drawer. The screenshot is the visual source of truth for this page. Match its proportions, typography hierarchy, warm neutral surfaces, olive emphasis, borders and spacing within the existing application shell. Real content and responsive layout may change wrapping and row height.

## Current behavior and evidence

Read-only inspection on 2026-09-24 found:

| Area | Current implementation |
| --- | --- |
| Entry | `frontend/src/features/procurement/ProcurementManagementPage.tsx` renders the directory for Super Admin and a separate project-suggestions workspace for Sales Managers. |
| Directory | `ProcurementVendorDirectory.tsx` already supplies Add, Edit/View, archive confirmation with reason/version, name/code search, lifecycle/type/basket filters, and previous/next pagination at 20 rows. It has no hero, overview counts, avatars, reset action or numbered pages. |
| KPI | Directory rows say “Not rated yet”; `VendorKpiPlaceholder.tsx` is also used in other procurement flows. No real vendor performance score is available. |
| Safe list data | `ProcurementVendorSummary` exposes classification, physical verification and basket references. Execution selections are available only in the private detail profile today. Do not fetch full profiles to decorate table rows. |
| Backend list | `ai-estimator-knowledge-reference.service.ts:listMasters` returns filtered rows and total; the route wraps these with pagination. The same infrastructure serves other configuration masters. No global vendor overview exists. |
| Search | Backend searches normalized name/code. GST registration is only a boolean; no GST number field exists. |
| Design assets | Existing interface font is Poppins; the application has heading tokens and a local warm interior photograph (`frontend/public/login-hero.png`), but no exact vase/cabinet header artwork from the reference. |

The worktree contains earlier authorized procurement implementation and unrelated chat/profile/mobile changes. Capture and preserve those baselines before implementation. Earlier spec and plan remain authoritative for the editor, private data, allocation and checkbox behavior.

## Visual and interaction requirements

### Header and overview

- Use the reference's “PROCUREMENT” eyebrow, “Vendor directory” serif heading and description: “Manage vendors, track their details, and review their performance across projects.”
- Place a warm cabinet/plant interior image at the right, with “Reliable partners for exceptional spaces.” in a muted olive panel. Supply a matching optimized, local decorative image during implementation; do not render the reference screenshot as the page. No remote image dependency, animation or 3D is needed.
- Four parallel summary tiles: **Total Vendors**, **Active Vendors**, **Under Review**, **Average KPI**. Match the reference's outlined pictograms and restrained color roles with small local SVGs, without adding an icon library or using Lucide in the redesigned directory.
- Total Vendors counts all non-archived vendors. Active Vendors counts those with lifecycle `active`. Under Review counts non-archived vendors whose stored physical-address verification flag is false or absent, with helper text “Pending address verification”. This is a verification category, not a new lifecycle state; it can overlap Active Vendors.
- Overview counts describe the whole current directory and do not change with table search/filters/pages. Any displayed active/review percentages use these counts and the non-archived total. Zero totals produce a sensible zero percentage. Omit the reference's growth arrow/+12%, because no historical comparison exists.
- Average KPI displays **Not available**. No fabricated score, stars, zero rating, average or trend.

### Configured vendors workspace

- Match the reference's section heading, helper line and olive Add vendor button. Add and Edit open the existing editor.
- One wide filter row where space allows: Search vendors, Status, Vendor Type, Main Basket, Sub Basket, Reset. Use the current real name/code search with an accurate “Vendor name or code” placeholder; GST/PAN search is outside this visual request.
- Search applies after a short debounce and immediately on Enter. Changing filters resets to the first page. Reset clears text and every filter, resets pagination and clears row selection. Cancel pending search updates on reset/unmount.
- Keep current lifecycle choices All current, Active, Inactive, Archived. Main/Sub Basket controls reuse the existing catalogs and IDs; changing Main Basket clears Sub Basket. Preserve loading/error/retry and unavailable-reference behavior.
- Columns match the reference: selection, Vendor Details, Type, Main Basket, Sub Basket, Status, Vendor KPI, Actions.
- Vendor Details shows a restrained initials avatar, entity name and code. Derive initials from the display name; use the vendor ID for identity. No fetching sensitive vendor photos for avatars.
- Type shows an Execution/Supplier tag. Execution has a second line with **Labor**, **Material + Labour**, or both, using the existing canonical selection array and legacy compatibility. Incomplete legacy profiles remain explicitly incomplete.
- Status continues to show the actual lifecycle. Pending verification may be shown as a separate “Under Review” note/badge within that cell; never replace or overwrite Active/Inactive with a fictitious persisted review state.
- Every Vendor KPI cell displays **Not available**. The bottom performance notice states that vendor KPI and performance recommendations are not available yet.
- Match Edit/View and Archive actions. User follow-up: use icon-only pencil for Edit, bin for Archive, and eye for read-only View, with accessible names and tooltips. Edit has a grey chip background; the bin has a red icon and red outline. Reserve compact action-column space, give vendor identity more room, and keep long codes on one line with the full value in a title. Preserve permission-based visibility, archive reason, expected-version checks and failure feedback. The overflow menu offers View details using the existing read flow; it must work with keyboard and restore focus when dismissed.
- Row checkboxes select only visible rows, support select-all/indeterminate, and expose a selected-count/Clear selection affordance. Selection clears on page/filter changes. This adds no bulk archive or background mutation.
- Show “Showing X to Y of Z vendors” and accessible numbered pagination with previous/next and ellipses when needed. Use five vendors per page to match the reference; page totals come from the backend. Correct an out-of-range page after archive/filter refresh.

### Responsive and accessible behavior

- Desktop: the four tiles share one row; filters and table align to the reference. Keep controls and long vendor names from overlapping.
- Tablet: overview becomes two columns; filters wrap deliberately. Narrow phones: compact header with reduced decorative imagery, readable overview, and stacked vendor rows with visible labels and actions. No page-wide horizontal overflow.
- Use semantic headings, table headers, named checkboxes, `aria-current` for pagination, clear keyboard focus and minimum 44px touch targets. Color is never the only status indication.
- Support loading, no vendors, no search results, filter-fetch error, overview error, list error, background refresh and permission loss. Do not turn missing/failed counts into zero or show stale private content after access is lost. Use simple loading text and reserved layout, not skeleton loaders.
- Scope the new styles to the Super Admin directory. Preserve the Sales Manager screen, shared editor styles and unrelated application pages. Use established design tokens where compatible with the reference; no new fonts/dependencies are necessary.

## Data/API impact and invariants

1. Add the canonical Execution selections to the safe vendor summary DTO (arrays/null); expose no contact, PAN/Aadhaar, address, photo metadata or verification actor details. Existing minimal procurement pickers remain unchanged.
2. Extend the existing authorized vendor-list operation with an optional directory-overview request/response. Return global non-archived total/active/pending-address-verification counts from backend data, independently of the paginated filtered results. Keep generic list consumers and other master kinds compatible when the option is absent. Do not download the whole directory into the browser to count it.
3. Document the additive query/response in runtime validation, frontend types and OpenAPI. Retain the existing operation-specific configuration-read authorization and sole-Super-Admin guard; no new role or endpoint is needed.
4. Invalidate overview and affected list/detail queries after create, edit, verification changes and archive. Keep all joins based on stable IDs, and reuse the established mutation-sync functions.
5. The redesign does not change vendor persistence, allocation amounts/caps, baskets, verification rules, audit history, photo lifecycle or Execution Type storage. No migration, seed, backfill or new notification is required. Rollback can remove the new view/additive response without rewriting data.

## Scope, assumptions and risks

Assumptions proposed for approval: the screenshot describes the directory landing page, not the drawer; “Under Review” represents existing pending physical-address verification; screenshot vendor names/counts are illustrative; five rows is the desired desktop page density. KPI is unavailable everywhere in this directory, as explicitly requested.

The screenshot has rounded panels and pale surfaces; follow its specific visual direction locally while avoiding added gradients, shadows, rainbow avatars or hover animation. Exact source photography is not available separately, so create a visually matching decorative header asset rather than claim identical pixels.

Out of scope: KPI calculation/input, vendor-rating workflow, new review approvals/statuses, bulk mutation, GST/PAN search, global navigation redesign, Sales Manager changes, vendor form redesign, production deployment, commits and live data operations.

Principal risks: computing counts from only the current page; confusing verification with lifecycle; leaking private detail into summaries; stale counts after edits; shared CSS affecting the editor/other roles; decorative controls without working behavior. The contracts above and verification below directly address these.

No unresolved architectural choice needs a separate question. Approval of this specification accepts the explicitly stated adaptations to live data.

## Acceptance criteria and verification

- **R1 Visual fidelity:** At a comparable desktop content width, the header/image, four overview tiles, configured-vendor panel, filters, rows, actions, pagination and performance notice closely match the supplied reference. Compare and visually inspect actual screenshots, not only DOM output.
- **R2 Truthful data:** All counts reconcile with a backend fixture containing active/inactive/archived and verified/unverified/missing-profile vendors across more than one page. Filtering/pagination does not alter overview totals. Average and row KPI always say Not available; no sample records or ratings ship.
- **R3 Working directory:** Search, Reset, filters, parent/child clearing, row selection, numbered pages, View/Edit/Add and archive work. Archive retains reason/CAS and refreshes overview/rows/page bounds. Existing both-selected Execution values appear in the Type detail and survive editing.
- **R4 Contracts/privacy:** Authorized list returns only the safe summary additions; unauthorized callers remain blocked; other master kinds/pickers remain compatible. Legacy profiles do not disappear, and private fields never enter shared list caches.
- **R5 Responsive/accessibility:** Check desktop around 1440–1704px, tablet 768px and phone 390px; keyboard flow, focus, accessible names, long content, loading/empty/error states and no page overflow. Inspect rendered imagery and run an accessibility scan.
- **R6 Regression:** Focused directory/profile/API/summary tests, backend/frontend typechecks and builds, and repository diff checks pass. Run impacted shared tests only; do not repeat unrelated full suites without a new regression reason. No lint script exists. Record exact results and limits in the task plan after implementation.

Implementation and verification evidence is recorded in the completed task plan linked above.

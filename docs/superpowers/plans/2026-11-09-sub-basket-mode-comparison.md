# Sub-basket mode comparison plan

1. Root: preserve existing dirty work; define shared UI/API contracts and durable requirements.
2. Backend owner: scoped comparison JSON/PDF, atomic group mutations for current and legacy quotations, authorization/OpenAPI, integration tests.
3. Staff owner: remove row tier controls, stage atomic sub-basket selections/restoration, preserve quantity/manual/component behavior, rendered tests.
4. Client owner: grouped current/legacy controls, staged save/comparison inputs, read-only Designer behavior, rendered tests.
5. Root: shared header slots, Mode controls, comparison dialog/download and API types, Configuration default-tab presentation and focused tests.
6. Integrate, review integrity, resolve findings, run focused suites and both builds, verify the running UI and restart the local API when complete. No commits, deployment, migration or customer communications.

Completed on `feature/designer_workflow` (local working tree).

- Configuration Mode remains available when Overview disables optional tiers; existing tier storage is preserved.
- Sales, Client and Designer use shared sub-basket controls with retained-choice Mode, configured-price intent, literal direct-item scope and atomic saves.
- Comparison JSON and PDF share server validation and pricing; hidden rows, stale sources, manual edits and component selections retain their protections.
- Independent integrity review findings were resolved: always-visible Mode tab, streaming download limit/session fencing, direct-group scope and explicit same-tier configured-price selection.

Validation:

- Shared controls/API/Configuration foundation: 100 tests passed. Focused Configuration screen scenarios: 11 passed.
- Staff regression suites: 250 tests passed. Client regression suites: 189 passed across the affected suites and corrected-fixture reruns.
- Backend comparison, atomic editing and API contract suites: 345 tests passed.
- Frontend and backend production builds passed; frontend retains existing bundle-size warnings. Whitespace diff checks passed.
- Live local Sales browser: Mode selected initially; Signature selection and Mode restoration work; row-level tier radios absent; comparison line prices and totals visible; PDF downloads with HTTP 200 and application/pdf. Desktop and 390px mobile dialog checks passed, including focus return and internal table scrolling. No browser console errors. No estimate was saved during browser checks.
- Broader Configuration screen tests have pre-existing failures around the specification editor, temporary links and stale UI expectations, reproduced against an isolated baseline. They are outside this change.
- Local API restarted with the new routes. No dependencies or migrations added.

Reference refinement:

1. Rename the shared comparison action and existing role-specific checks to Check tier comparison. Completed; 73 tests passed across four suites.
2. Adapt only the PDF presentation to the reference BOQ structure: grouped Qty/Rate/Amount columns, readable subtotal bands, wrapped content and repeated page furniture. Keep server calculations, permissions and contracts unchanged.
3. Verify generated PDF content and pagination using synthetic data, visually inspect rendered pages, then build and refresh the local API.

Reference refinement completed:

- PDF now uses the existing Lisno logo, reference navy/gold palette, grouped Qty/Rate/Amount columns, exact paise, subtotal band, repeated headers and page footers. No calculation or API contract changes.
- 73 frontend tests and 40 backend tests passed. Frontend and backend production builds passed; existing frontend bundle-size warning remains. PDF tests cover long names/reasons, multiple pages, component-derived prices, unavailable tiers, exact integer-paise formatting and text bounds/non-overlap.
- Restarted the local API and downloaded a fresh PDF through the actual renamed Check tier comparison action on the Sales estimator. HTTP 200/application/pdf; extracted and visually verified the new template, configured ₹60,750 subtotal and absence of margin calculations. No browser errors and no estimate saves.
- Verified live download: /private/tmp/lisno-tier-comparison-live.pdf; rendered preview: /private/tmp/lisno-tier-comparison-live.png.

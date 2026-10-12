# Procurement My requests implementation

Date: 2026-10-12
Status: Implemented and verified on 2026-10-12. No deployment or configured database changes.
Specification: [Request completion and My requests](../specs/2026-10-12-procurement-my-requests-design.md).

## Scope and source of truth

Remove Vendor name from Main/Sub-Basket proposal forms and make absent vendor context valid end to end. Add the Procurement personal request directory with existing Vendors styling. Confirmed submission closes all panels and preserves the originating vendor draft in memory for this signed-in tab. Existing Configuration and Super Admin behavior/data remain intact.

The existing authenticated submitted-request list is canonical for submitted rows/status; saved proposal drafts stay separate. Query additions are `search`, `status`, `targetKind`, `limit`, `offset`. Optional proposal input vendorName is nullable/omittable; returned proposal/request/notification vendorName is nullable. No fabricated vendor name. Existing IDs, idempotency, unique indexes and legacy named requests retain their behavior.

## Tasks and ownership

1. **Baseline/contract, primary (complete):** captured initial status/diff and hashes at `/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-my-requests-tv7mcpx5`. Primary owns frontend proposal/notification types and integration. All prior dirty work preserved.
2. **Implementation, complete.** Independent slices:
   - Backend owner: backend proposal/request/notification contracts, models, services, corresponding route validation/OpenAPI and focused tests. Supports vendorless configuration proposals and filtered requester-only lists. No migrations or DB mutations outside disposable tests.
   - Request UI owner: CreateProposalPanel, OwnProposalList, new ProcurementRequestsPage/scoped styles/tests, vendorBasketRequestApi. Remove input/validation; show own requests using actual backend statuses. Root owns route/nav registration and surrounding vendor editor.
   - Primary: router/routeRegistry/return paths; VendorBasketFields, ProcurementVendorEditor, ProcurementVendorDirectory; scoped in-memory draft retention; ProposalWorkspace success/dismissal integration; existing review/notification null-safe captions. Primary owns cross-layer final reconciliation and docs.
3. **Integrity review:** after writers finish, review auth isolation, vendorless uniqueness/idempotency/notification, draft retention and version safety, and default Super Admin/Configuration preservation. Resolve confirmed findings.
4. **Verification:** after integration/review, run focused backend replica-set and HTTP tests, frontend rendered workflows/navigation/list/draft tests, both typechecks/builds and `git diff --check`. Browser verification at desktop/mobile through disposable fixtures checks no Vendor name field, successful vendorless creation/submission, panel closure, navigation/status table and resumed draft. Broaden only when failures or changed shared contracts justify it; known unrelated broad-suite failures remain documented separately.
5. **Handoff:** record precise passing/failing/unrun checks, artifacts and limitations. No commit, push, deployment, seed, production sync or configured DB writes.

## Acceptance trace

- AC1/7: nullable vendor proposal creation/submit/approve/reject/revise, old-client replay, duplicate races and exactly-once notification tests.
- AC2/3: close only on confirmed submit; error/uncertain response retains state; same-user draft/files survive route changes; logout/identity switches clear state; original vendor CAS preserved.
- AC4/5: own submitted requests include legacy rows once, correct server filtering/count/pagination; drafts resumable; detail/rejected state remains available.
- AC6: asymmetric requesters and route permissions; null-safe Super Admin captions preserve existing named rows, approval and Configuration behavior.
- AC8: named controls, keyboard/focus, responsive table, loading/empty/error/permission states, builds/typechecks and rendered QA.

## Parallel safety

No overlapping source ownership. Writers coordinate contract changes through primary. Every writer receives the baseline, existing dirty-file warning, and prohibition on reverting others. Full verification runs on the integrated tree after writers finish. No dependencies or lockfiles are needed.


## Final verification and review

- Independent integrity review closed its findings: prevent another vendor overwriting retained entries; clear retained entries on directory access denial; synchronize detail cache on explicit reload; integrate the vendor-details editor as well as directory; restore focus to Resume vendor draft.
- Backend: `npm test -- tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-request.replica-set.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts tests/api-docs.test.ts` passed 153 tests (41 + 36 + 17 + 59). Proposal master HTTP suite passed 19. Only disposable Mongo replica sets used.
- Frontend: 570 unique focused tests across 14 files passed. Integrated runner passed 543 in 13 files; final Directory suite passed 27 after the added stale-reload/different-vendor/denial regressions. Additional targeted guard rerun passed. Suites: CreateProposalPanel, OwnProposalList, ProposalWorkspace, ProcurementRequestsPage, ProcurementVendorProfile, VendorDirectory, VendorKpiWeb, ProcurementVendorDraftProvider, useVendorMsmeCertificate, BasketNotifications, KnowledgeBasketRequestReview, navigation, routePaths, router.
- Both `npm run typecheck` and `npm run build` passed in frontend and backend. `git diff --check` passed. Vite reports its existing large main chunk warning (2,661.76 kB, gzip 728.58 kB); no lint script exists. Full suites and OCR were not rerun for this bounded change.
- Real-browser QA used real proposal/request routes and disposable Mongo on loopback port 4211: both creation forms contain zero Vendor name controls; both vendorless target types created and submitted; Main Basket configured through Sub-Basket, Main Line and UOM before submit; request type filter returns only matching canonical rows; vendor entry survives route navigation and resume. Sub-Basket confirmed submission produced zero remaining dialogs and focused Resume vendor draft. Main Basket submission dismissed overlays, allowing normal requests navigation; focused component tests cover exact closure timing for both targets.
- At 1440px and 390px, requests page has no horizontal overflow. Drawer is 1008px at 1440px (70%). Reviewed screenshots for both forms and both list widths. Mobile whole-page axe has zero violations; desktop axe reports only existing sidebar contrast on Projects/Vendors links, outside changed page content. Browser console contained React DevTools info only, no app errors. Initial QA attempts were invalidated by Vite reloads while test files were being edited; final flows ran after writers finished.
- Browser server and disposable database stopped; browser session closed. Temporary screenshots/entry/cache moved outside the repository to `/tmp/lisno-my-requests-browser-evidence`. Test/build logs: `/tmp/lisno-my-requests-final-frontend-tests.log`, `/tmp/lisno-my-requests-final-vendor-directory-tests.log`, `/tmp/lisno-my-requests-final-{frontend,backend}-{typecheck,build}.log`.
- Snapshot hashing confirmed all session changes are within assigned backend/frontend sources/tests and these documents. Prior dirty work preserved. No dependencies, lockfiles, seeds, migrations, local-to-production sync, configured local database writes, deployment, commits or pushes.
- Vendor drafts are held only for this signed-in tab session. Reloading the browser or signing out clears them; saved basket drafts persist through existing backend services. Final local process check found the existing frontend on localhost:5173 in this repository, but no backend listening on port 3000. No configured-data bootstrap was run to start it.

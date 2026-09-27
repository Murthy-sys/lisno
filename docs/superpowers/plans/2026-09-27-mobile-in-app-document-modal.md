# Task plan — Mobile in-app document modal

Approved specification: [mobile in-app document modal](../specs/2026-09-27-mobile-in-app-document-modal-design.md) (approved 2026-09-27). Gate 2: task plan only. Product edits begin only after this plan is approved and the user selects execution mode.

## Baseline and implementation contract

- The three Open/View entry points are `ClientEstimateAction.tsx` (**Open estimate PDF**) and `ProjectDocuments.tsx` (**Open PDF** for estimates; **Open** for approved design files). Their document bytes come from existing authenticated paths, with authorization enforced by the backend. The existing `ProtectedDocumentViewer` already owns a full-screen modal and protected local-image lifecycle; its non-image effect currently calls the share flow automatically.
- The prior approved project/estimate implementation is still uncommitted. `ClientEstimateAction.tsx` is modified, while `ProjectDocuments.tsx`, `ProtectedDocumentViewer.tsx`, `useProtectedDocument.ts`, and their focused tests are untracked. Before implementation, record the full dirty-path set, tracked per-target diff, and content/baseline of each untracked target. Preserve other work and give each target one writer.
- Treat **Open/View** as an in-app preview intent. Treat **Export/Download** as a user-initiated share intent. Never invoke `artifact.share()` from a PDF-ready effect. Use `runtime.transfers.download`, the existing source identity and byte limits, and a temporary local file URI for native rendering. The modal remains open until Close/Back.
- Keep `ProtectedDocumentViewer`'s existing public `visible`, `source`, `onClose`, and optional `renderImage` contract unless a specific preview error or explicit fallback needs a small additive prop. Keep the estimate and project resource paths as they are. Do not alter backend, web, approval, or annotation contracts.
- Project design uploads may be PDF, PNG, JPEG, WebP, TIFF, or HEIC. Native PDF and ordinary images must render in the modal. A valid image unsupported by the device decoder gets a non-disclosing modal state and explicit authorized Download fallback. Office formats are outside this project-design contract.

## Dependency-ordered tasks and ownership

### T0 — Preserve baseline and settle the renderer interface

- **Owner:** primary agent. No product writer runs until this is complete.
- **Work:** capture `git status --short`, tracked target diffs, and content of the untracked viewer/project files and tests. Confirm source URI shape and transfer cleanup tests. Define a small `PdfDocumentSurface` interface: local URI in, loading/render-error callbacks out, with the modal owning close and retry. Confirm the fallback action is a button, never automatic. Share this interface with the entry-point writers before parallel work.
- **Done when:** prior changes are understood, ownership is assigned without overlap, and the PDF surface/viewer contract is fixed for this plan.

### T1 — Native PDF renderer compatibility and adapter *(after T0)*

- **Owner:** primary agent for `mobile/package.json`, `mobile/package-lock.json`, `mobile/app.config.ts` only if needed, and a new bounded PDF adapter under `mobile/src/features/documents/` (distinct from the viewer/hook files). No other writer edits these paths.
- **Work:** evaluate the Expo-oriented local-URI PDF component first, then `react-native-pdf` if its actual compatibility/build fails. Add only the chosen necessary dependency and native configuration. Keep PDF bytes on the authenticated local-file path, with no remote renderer or token-bearing URL. Expose load, page/render error, zoom, and multipage behavior to the viewer. Prove native Android compile/link and app startup before settling the adapter contract; investigate package-specific failures instead of hiding them behind a share fallback.
- **Done when:** the selected adapter compiles and loads in a native build of the current Expo 57/React Native 0.86 app. T5 then proves actual synthetic multipage PDF rendering through the finished modal. If the first candidate fails, record the exact failure and reason for the final choice. Check iOS package support and build/runtime where an iOS runner exists.

### T2 — Protected modal viewer and lifecycle *(after the T1 adapter contract)*

- **Owner:** one mobile viewer writer for `mobile/src/features/documents/ProtectedDocumentViewer.tsx`, `useProtectedDocument.ts`, and their focused tests only. The primary agent owns the separate PDF adapter. This writer may not edit entry-point screens or package/native configuration.
- **Work:** replace the automatic non-image share effect with PDF rendering in the existing modal. Retain image and annotation `renderImage` behavior. Show loading, download errors, renderer errors, unsupported/undecodable image states, Retry, Close, and an explicit authorized Download fallback for project design files where needed. Prevent stale render callbacks or ready files from a superseded source from changing the current modal. Keep transfer cancellation and release on close/unmount/source/session change, including late results and render failures. Verify modal labels, Back, touch target, and no auto-share.
- **Tests:** local PDF stays in modal, renderer failure, malformed/unsupported file, image decode failure, retry, repeated open, source/session switch, late transfer/result cleanup, denied/non-disclosing messaging, and image-editor regression. Replace the old tests that asserted PDF auto-share.

### T3 — Estimate review Open action *(after T0; can run alongside T2 once its contract is shared)*

- **Owner:** one estimate writer for `mobile/src/features/estimates/ClientEstimateAction.tsx` and `ClientEstimateReviewScreen.test.tsx` only. No viewer/hook/project-document edits.
- **Work:** replace the direct download/share implementation of **Open estimate PDF** with `ProtectedDocumentViewer`, using `/client/estimates/:estimateId/pdf` and the stable estimate ID. Keep estimate decision state and access gates untouched. A repeated tap opens one modal. Closing returns to the estimate review, and an auth/transfer error is displayed within the modal.
- **Tests:** authorized Open renders the viewer with the exact client PDF path, does not share, closes on Close/Back, and leaves decision controls and denied state unchanged.

### T4 — Project Documents Open actions *(after T0; can run alongside T2/T3 once its contract is shared)*

- **Owner:** one project-document writer for `mobile/src/features/projects/ProjectDocuments.tsx`, `ProjectDocuments.test.tsx`, and only directly affected expectations in `ProjectStructure.test.tsx`. No viewer/hook/estimate-screen edits.
- **Work:** keep existing estimate/design `ProtectedDocumentViewer` entry points; update their labels/hints and any small props needed by T2 so Open always previews in-app. Preserve **Export PDF** and **Download** as separate share actions and keep the approved/client-visible filter, pagination, exact resource IDs, and operation gates unchanged. Check that a denied or unsupported document remains in the modal with an honest state.
- **Tests:** estimate Open and approved PDF/image Open do not call share; explicit Export/Download still do; unauthorized/hidden designs have no Open; multiple project/estimate IDs remain isolated; narrow-width controls remain reachable.

### T5 — Integrated review and verification *(after T1–T4 writers finish)*

- **Owner:** primary agent integrates and resolves confirmed issues. In Mode A, `integrity_reviewer` then `verification_runner` perform sequential read-only passes; in Mode B, primary agent performs equivalent review and verification inline. Final checks must run on the settled shared worktree, not while writers are editing.
- **Work:** inspect final per-target diffs and dependency changes; review private-file lifecycle, authorization, stale callbacks, UI labels, and preservation of annotation editors. Fix issues with the appropriate owner. Run focused tests, full mobile typecheck and tests, contract drift, Android export/native build, and rendered modal checks on a phone and tablet width with a synthetic PDF and image. Exercise Close/Back, zoom/scroll, offline/denied/render error, repeated tap, font scale, and TalkBack where available. Check iOS native behavior and VoiceOver when an iOS runner is available; report exact gaps otherwise. Finish with `git diff --check` and `git status --short`.
- **Done when:** every acceptance criterion has evidence from tests and native interaction, or its unmet verification limit is stated precisely. No staging, commit, push, deployment, migration, or production file action is part of this plan.

## Parallelism and dependencies

T0 is the only first task. T1 establishes the PDF adapter contract and native feasibility. After that contract is shared, T2, T3, and T4 can run in parallel in Mode A because their product/test paths do not overlap; T1's package/adapter owner remains the primary agent. T3 and T4 can also begin from T0 using the stable existing viewer props, but must wait for T2's settled additive-prop decision before finalizing tests. T5 starts only after all writers stop.

## Acceptance and verification map

| Approved criterion | Tasks | Evidence |
| --- | --- | --- |
| AC1: three Open/View entries stay in modal; Close/Back returns | T2–T4, T5 | viewer and entry tests; native navigation check |
| AC2: multipage PDF zoom/scroll; image/annotation regression | T1, T2, T5 | synthetic native PDF, image/editor tests, phone/tablet interaction |
| AC3: separate Export/Download; legacy image fallback | T2, T4, T5 | no auto-share assertion, explicit share tests, decode-error modal check |
| AC4: loading/errors/retry, identity and file cleanup | T2–T4, T5 | denied/offline/oversize/render-error tests; source/session/late-result tests |
| AC5: focused, contract, typecheck and native evidence | T1, T5 | exact command results and rendered Android check; iOS/TalkBack limits reported |

## Verification commands and boundary

- Focused: `cd mobile && npm test -- --runInBand src/features/documents/ProtectedDocumentViewer.test.tsx src/features/documents/useProtectedDocument.test.tsx src/features/estimates/ClientEstimateReviewScreen.test.tsx src/features/projects/ProjectDocuments.test.tsx src/features/projects/ProjectStructure.test.tsx` (adjust Jest arguments to its actual CLI syntax if needed).
- Shared regression: `cd mobile && npm run typecheck && npm run test:contracts && npm test -- --runInBand && npm run export:android`.
- Native: `cd mobile && npm run build:android:debug`, then install/run the debug app on the available Android emulator or device with synthetic PDFs/images. Native configuration changes require a rebuilt binary. Run an iOS build/check if an iOS runner is available.
- Hygiene: `git diff --check` and `git status --short`. Record any generated ignored outputs and remove only those created by this task when safe.

At this gate only this task-plan file was written. The plan does not authorize implementation until approval and execution-mode selection.

## Execution and verification outcome — 2026-09-27

The specification and plan were approved, and the user selected Mode A. The implementation uses the existing protected full-screen viewer for image and PDF Open actions, with `@kishannareshpal/expo-pdf@0.3.2` for local PDF rendering. Project and estimate Open actions remain in-app; Export/Download is still a separate user-triggered share action. PDF loading has a bounded render timeout, and changing project/account/runtime remounts document viewers so old previews and names are released. An iOS bundle identifier was added to the Expo config so the generated iOS project can build. No backend route, permission, schema, or approval behavior changed.

- Focused final verification: 8 Jest suites, 104 tests passed. Full mobile suite: 126 suites, 1,179 tests passed with `--forceExit`; the first pass completed all tests but hung on an existing open handle and was interrupted. The successful pass emitted one React `act(...)` warning in an unrelated knowledge workspace test.
- `npm run typecheck`, `npm run test:contracts` (3 tests), `npm run export:android`, `npm run build:android:debug`, an iPhone simulator `xcodebuild` Debug build, and `git diff --check` passed. Android Gradle completed 582 tasks.
- A temporary synthetic two-page PDF was rendered in the native Android app; both pages loaded, and a swipe reached page two. The same synthetic PDF loaded and displayed both pages in an iPhone 17 Pro simulator build. The temporary QA route/startup redirect, iOS generated project/build output, and synthetic screenshots were removed after inspection.
- Real authenticated Client document flows were covered by focused component and protected-transfer tests, not by a live backend session. iOS swipe/zoom, TalkBack/VoiceOver reading of PDF text, font-scale and tablet interaction, and a malformed PDF on a native device were not exercised. The modal shell has accessible controls, while rendered PDF text accessibility remains dependent on the native component.

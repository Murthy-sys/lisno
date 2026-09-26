# Mobile in-app document modal

Date: 2026-09-27. Gate 1: specification only. This document supersedes the platform-reader behavior for **Open/View** in the approved [mobile client estimate and design review specification](2026-09-26-mobile-client-estimate-design-review-design.md). It does not change that specification's estimate, approval, annotation, or document visibility rules.

## Goal

When a user taps **Open PDF**, **Open estimate PDF**, or **Open** on an approved design document in the mobile estimate/project flow, show the document inside a Lisno modal. Keep the user on the source screen when the modal closes. **Export PDF** and **Download** remain explicit, separate actions.

## Current behavior and evidence

- `mobile/src/features/documents/ProtectedDocumentViewer.tsx` already provides a full-screen React Native `Modal` and renders local images inside it. For a ready non-image file, an effect immediately calls `openExternally()` and closes after the share/platform reader returns. Its PDF tests assert that handoff.
- `mobile/src/features/projects/ProjectDocuments.tsx` sends the project Documents tab's estimate **Open PDF** and approved design **Open** actions through that viewer. Its **Export PDF** and **Download** controls independently invoke the share flow.
- `mobile/src/features/estimates/ClientEstimateAction.tsx` has another **Open estimate PDF** action on the estimate review screen. It directly downloads then shares the PDF, without using the modal viewer.
- `mobile/src/features/documents/useProtectedDocument.ts` already downloads through authenticated transfers to a temporary local URI, limits file size, ties the artifact to environment/session/source identity, and releases it on close or source/session change. This is the file source for the new preview.
- `backend/src/middleware/upload.ts` validates task design-version uploads as PDF, PNG, JPEG, WebP, TIFF, or HEIC. The design-version download endpoint is authenticated. Word/Office files are not accepted by this project-design upload path.
- `mobile/package.json` has no PDF rendering dependency. The app uses Expo 57 and React Native 0.86, so adding an embedded native PDF view requires dependency compatibility and a native rebuild. The [Expo-oriented native PDF component](https://github.com/kishannareshpal/expo-pdf/blob/main/README.md) documents local file URI rendering; [react-native-pdf](https://github.com/wonday/react-native-pdf/blob/master/README.md) is another native option but requires additional native dependencies/configuration. Neither is yet verified against this repository's build.
- The current worktree contains uncommitted mobile estimate/project/document changes from the prior approved request. Preserve those edits and inspect their target diffs before implementation.

## Recommended approach and alternatives

Use the existing `ProtectedDocumentViewer` as the single modal shell. Render PDFs from its protected local URI with a compatible on-device native PDF component. Keep the existing image path and annotation editor path intact. Route the estimate review screen's Open action into the same viewer. Choose the smallest native PDF package that passes this repository's Expo 57/React Native 0.86 Android build and iOS compatibility checks; the Expo-oriented component is the first candidate, and package selection is a bounded implementation check rather than an API or product decision.

An embedded PDF.js/WebView reader would avoid a native PDF component, but it would add a second document runtime and a more complex local-file bridge, especially on Android. A server-rendered PDF-to-images flow would require new protected endpoints and storage/processing contracts. Neither fits this existing authenticated local-file modal as directly. The current external reader/share flow does not meet the requested Open/View behavior.

## Requirements and UX contract

1. Tapping **Open PDF** in Project Details Documents, **Open estimate PDF** in estimate review, or **Open** on an approved design file opens a full-screen in-app modal. The modal has an accessible filename/header and Close control, supports Android Back, and returns focus/navigation to the initiating screen on close. Repeated taps cannot stack modals or duplicate transfers.
2. A downloaded PDF renders **inside** the modal on Android and iOS. Users can scroll through a multipage PDF and zoom to read detail. The modal stays open until the user closes it; loading completion must never automatically invoke the platform reader or share sheet.
3. Supported images continue to preview inside the modal. Existing plan-page, drawing, and section annotation/image viewers must retain their current behavior. If a platform cannot decode a valid legacy TIFF/HEIC image, the modal shows a non-disclosing preview-unavailable state with the existing authorized Download option where available, rather than closing or silently handing the file to another app.
4. The modal shows loading, denied/unavailable, network/size, and render-failure states with a retry or close path. A failed PDF parse or unsupported file MIME must not spin indefinitely. The user can distinguish download failure from a local renderer failure without seeing a private path, raw server response, or token.
5. **Export PDF** and **Download** retain their explicit share/export behavior and accessible labels. No Open/View action shares automatically. Update any hint that still promises a platform reader.
6. The file continues to arrive through the current authenticated transfer; the PDF renderer receives only the temporary local URI. Closing, changing source, changing account/environment/session, and unmounting cancel outstanding transfers and release held files, including after a late result or render error. Keep current size limits and resource-ID paths.
7. The modal fits a narrow phone, large font scale, and tablet; its controls are keyboard/screen-reader accessible and have sensible focus order. PDF page content accessibility depends on the selected native renderer, so verify actual TalkBack/VoiceOver behavior and document any limitation rather than claiming text accessibility from the surrounding shell alone.

## Scope and non-goals

- Scope is the mobile Client estimate review and Project Details Documents Open/View actions created by the prior approved request, including those same project-document actions for other authorized roles. No backend or web change is expected.
- A generic Office document viewer, chat attachment viewer, task evidence viewer, or change to unrelated **Download/Open attachment** controls is outside this request. “Doc” here means an accepted project design document: PDF or image. Extending uploads to DOCX/XLSX/PPTX would be a separate upload/rendering contract.
- No PDF editing, PDF-binary annotation, change to source-plan-page V1 annotations, new approval workflow, remote document conversion, public file URL, persistence migration, or production action.

## Data, authorization, and compatibility

- Preserve existing estimate ID, design-version ID, endpoint, operation gate, and backend resource authorization. No route, response, schema, permission, or database changes are proposed.
- Preserve approved/client-visible filtering on the project document list. A modal cannot expose a file absent from the authorized list, and a direct denied download remains a non-disclosing error.
- A native PDF module may require additions to `mobile/package.json`, the lockfile, and Expo native configuration. Rebuild and test a native binary; a JavaScript export or Jest run alone cannot establish that the renderer works.
- Treat the existing external-reader PDF assertions as regression tests to replace, while preserving explicit Export/Download assertions and protected-transfer cleanup tests.

## Risks and handling

- **Native compatibility:** first prove the selected PDF package can build and render a synthetic local PDF on the repository's Android target; check iOS support from package source/build when an iOS runner is available. If the first candidate fails, compare the next native option before changing product/API scope.
- **Large or malformed PDFs:** keep byte limits, surface native parse failures in the modal, release the artifact after closing, and check memory/use on a multipage fixture.
- **TIFF/HEIC decoder support:** these are valid backend uploads but may vary by platform. Keep the modal open with an honest preview-unavailable state and an explicit authorized Download fallback; do not label them PDFs or convert them through a remote service.
- **Accessibility of rendered PDF text:** modal controls can be accessible independently of PDF text. Check native screen-reader reading and disclose any renderer limitation in the handoff.
- **Dirty worktree:** preserve prior uncommitted work and assign clear ownership before any writers edit its files.

## Acceptance criteria

1. All three scoped Open/View entry points show PDF/image content in the in-app modal, without a share sheet or external reader; Close and Android Back return to the same screen.
2. A multipage estimate PDF and approved design PDF can be scrolled and zoomed. Image preview and existing annotation editors still work.
3. Explicit Export/Download still uses its separate share/export action. Unsupported/undecodable legacy image types show the modal's preview-unavailable state and authorized fallback.
4. Loading, 401/403/404, offline, oversized, malformed PDF, retry, repeated tap, source switch, and session switch are handled without cross-document display, stale callbacks, or retained temporary files.
5. Focused modal and entry-point tests, mobile typecheck, contract tests, and Android native build/rendered interaction checks pass. Check iOS native behavior when an iOS runner is available and report any unrun platform or assistive-technology check exactly.

## Assumptions and open decisions

- **Assumption:** “View PDF or View Doc” refers to the estimate and project design-document Open/View controls in the active mobile feature request. This does not relabel every app-wide attachment download as View.
- **Assumption:** “Doc” means the project-design file types the backend currently permits, not a new Office-file upload feature.
- **Open implementation decision:** select the native PDF package after a compatibility check against Expo 57/React Native 0.86. No product or API decision is blocked on that selection.

## Verification boundary

At this gate only repository files and primary library documentation were read, and this specification was written. No task plan, product code, dependency installation, build, native run, migration, commit, push, or deployment was performed for this request.

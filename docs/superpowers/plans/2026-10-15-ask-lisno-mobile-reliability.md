# Ask Lisno mobile and reliability plan

Specification: [design](../specs/2026-10-15-ask-lisno-mobile-reliability-design.md).
Authority: standing autonomous Mode A, requested both web/mobile.

## Integrated work: local implementation verified, live-provider and device checks limited
1. Completed read-only backend/web/mobile audits and initial dirty baseline `/tmp/lisno-ask-ai-initial*`. Synthetic-only live provider reproduction returned503 twice; no customer data sent.
2. Backend writer: provider adapter and focused tests only; bounded retry/accounting, native multipart handling and actual payload history sizing (AC3–4). Root owns any cross-layer contract change.
3. Web writer: private assistant endpoint deadline/safe error copy and result GET retry with focused frontend tests (AC5). No shared API or shell redesign.
4. Mobile feature writer: new `features/ask-lisno/` API/parser/conversation/answer components and tests only (AC2). Root owns registry, entry points, FeatureWorkspace, feature definitions and message recovery (AC1,5). Pass optional initialProjectId; current backend request has no private idempotency field.
5. Root integrates, verifies native theme/dock preservation, adds pending-AI foreground polling and safe result-read recovery. Share contract findings immediately.
6. After writers freeze: integrity review for permissions, cancellation, retry/accounting and finance; fix findings, then independent verification (AC6). Only one integrated parent active.

Tasks2–4 are disjoint and run in parallel. Preserve every pre-existing dirty change, including prior mobile parity and Procurement redesign. No stage/commit/push/deploy, migrations, seed, live client messages or customer data in fixtures. Evidence stays under `/tmp/lisno-ask-ai/`.

## Verification
Backend provider/Ask Lisno/runtime/chat focused tests; replica-set tests if transactional code changes (not planned). Frontend AskLisnoLauncher/answer/provider refresh tests and build/typecheck. Mobile new assistant/registry/projects/messages tests, contracts/typecheck and Android export; broaden mobile suite once after integration. Synthetic provider smoke verifies recovery, but cannot promise future upstream availability. Native/web interaction and accessibility checks use synthetic data only. Record exact results and unrun environments at handoff.

## Integrated result, 2026-10-15
Implementation and integrity review finished. Native Client entry points use the existing Home, project action menu and More registry; root tabs and dock styling are unchanged. Private conversation state is temporary and scoped to session/environment/project, with cancellation and access revalidation. Mobile group AI now polls pending results within a bounded foreground budget. Web and mobile distinguish busy, timeout, usage limit and provider failures and retain manual retry.

The shared provider performs at most four HTTP attempts per generation, reserves and settles every attempt, honors bounded retry delays, preserves signed tool history and all coalesced source message IDs, and fits optional history to the actual complete payload. Multipart final text and tool prefaces are handled without exposing unchecked provider text. No backend persistence or transaction behavior changed.

Independent integrity review found no confirmed blocker. Root subsequently corrected a native greeting response that unnecessarily displayed a project-team handoff; its focused regression passes.

Verification evidence so far:
- Backend: 451 tests across 12 focused suites, typecheck and build passed. HTTP suites required loopback sandbox escalation.
- Frontend: 121 tests across 7 focused suites, typecheck and build passed. Actual components in an isolated Chromium harness with synthetic contexts/API passed private busy/manual retry and group transient result recovery at 1440×1000 and 390×844. Enter/Escape, focus return and reopening passed; no horizontal overflow. Ask Lisno dialog and messages axe scans each reported zero WCAG A/AA violations and 18 checks passed. These are component integration checks, not full authenticated-route or live-provider certification.
- Mobile: 107 focused tests passed before the final greeting correction; the complete Ask Lisno folder subsequently passed 29 tests. Final typecheck and 3 contract checks passed. Full suite: 1663/1664 tests across 177/178 suites passed; the unchanged MessageActionSheet self-assignment test had an ambiguous-text failure and passed 9/9 on isolated rerun. Do not describe the full suite as green.
- Final Android export passed after the greeting correction, producing `entry-3265a47f4d7e349519f7596641190975.hbc` in ignored `mobile/dist/android`. Isolated native startup did not reach login after one controlled warm restart. Android boot/bundling and React Native initialization succeeded, but the fresh AVD was memory pressured and a Hermes probe timed out. Root cause is unconfirmed; device walkthrough and real SSE disconnect remain unverified.
- Resumed mobile visual fallback passed at390×844 through React Native Web using the actual Entry, Workspace, conversation hook, API parser, Answer, styles, tokens and Button with synthetic runtime responses. Entry, initial state, project choice, source-backed answer,503 busy and manual retry passed; no horizontal overflow, final console errors or warnings. Poppins and cream/olive styling were retained. This verifies mobile component rendering, not the full native shell/device. Six screenshots and details: `/tmp/lisno-ask-ai/mobile-web-visual/RESULTS.md` and `output/playwright/` beneath it. Browser/helper server4198 were stopped.
- Final tracked/untracked baseline comparison confirms only assigned task sources changed. Metro/export logs were restored to their exact initial contents after preserving evidence. Task-only API/Metro/emulator5556 were stopped and the exact temporary environment override removed; existing emulator5554 was untouched.

Live-provider limitation: model metadata succeeded, but synthetic requests returned503 UNAVAILABLE despite bounded retries; one sequence also returned429. A separate minimal generation request returned503 with an overload indication and no key/billing/quota indication. After resuming, a final synthetic greeting through the compiled shared provider returned statuses503,429,429,429 and `ASSISTANT_RATE_LIMIT`; all four attempts were reserved and settled. Real upstream success, real-device SSE-disconnect recovery and production deployment remain unverified. No model change, deployment, migration, dependency, real customer message or production write was performed.

Original temporary evidence was recorded at `/tmp/lisno-ask-ai/verification`, `/tmp/lisno-ask-ai/web-visual`, `/tmp/lisno-ask-ai/visual` and `/tmp/lisno-ask-ai/provider-after.log`. Those temporary artifacts were no longer present after the interrupted session; the exact executed checks/results are retained here. Resumed provider evidence is `/tmp/lisno-ask-ai/provider-final.json`. Synthetic fixtures only.

## Exact executed verification commands
From `backend/`:
```sh
npm test -- tests/project-assistant-gemini.test.ts tests/project-assistant-runtime.test.ts tests/project-assistant-narrative.test.ts tests/project-assistant-pricing.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-app.test.ts tests/project-chat-assistant.test.ts tests/project-chat-assistant-routes.test.ts tests/ask-lisno.test.ts tests/ask-lisno-project-list.test.ts tests/ask-lisno-project-resolution.test.ts tests/ask-lisno-routes.test.ts --maxWorkers=2
npm run typecheck
npm run build
```
From `frontend/`:
```sh
npm test -- src/features/ask-lisno src/features/estimates/AskLisnoLauncher.test.tsx src/features/messages/ChatAssistantResult.test.tsx src/features/messages/useChatAssistant.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```
From `mobile/`:
```sh
npm test -- --runInBand src/features/ask-lisno src/features/messages/usePendingAssistantRefresh.test.tsx src/features/projects/ProjectsWorkspace.test.tsx src/features/projects/ProjectStructure.test.tsx src/navigation/registry.test.ts
npm test -- --runInBand
npm test -- --runInBand src/features/messages/MessageActionSheet.test.tsx
npm run test:contracts
npm test -- --runInBand src/features/ask-lisno
npm run typecheck
CI=1 EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run export:android
```
From repository root: `git diff --check` and `git status --short`. No repository lint script exists. Full backend/frontend suites, replica-set, OCR and migration lanes were not run because this task changed no persistence, transaction, OCR or migration boundary. Existing bundle-size and React act warnings remain.

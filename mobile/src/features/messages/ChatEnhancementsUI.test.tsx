import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { publishedPriceFixture } from "./assistantPricingFixtures";
import type { ReactNode } from "react";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ChatParticipantManagement, ChatProjectNameDialog } from "./ChatManagement";
import { ChatAssistantMessage } from "./ChatAssistantMessage";
import { presentChatSummary, presentMessage, type PresentedChatParticipantPage } from "./chatModel";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
const runtimeMock = jest.mocked(useConfiguredRuntime);
beforeEach(() => { jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() }); });
const admin = { user: { id: "admin-a", name: "Admin", email: "admin@example.test", role: "admin" }, authorization: { role: "admin", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["chat.participants.manage", "chat.project_name.manage", "chat.assistant.read", "chat.assistant.request"] } } as AuthenticatedSession;
const clientSession = { ...admin, user: { id: "client-a", name: "Client", email: "client@example.test", role: "client" }, authorization: { ...admin.authorization, role: "client" } } as AuthenticatedSession;
function setup(session = admin, overrides = {}) { const api = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), ...overrides }; runtimeMock.mockReturnValue({ environment: { environment: { id: "test-env" }, generation: 1 }, session: { status: "authenticated", session, generation: 3 }, runtime: { api: { authenticated: api } } } as unknown as ReturnType<typeof useConfiguredRuntime>); return api; }
function harness(element: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }); return { client, node: <QueryClientProvider client={client}>{element}</QueryClientProvider> }; }
const person = { id: "designer-a", name: "Mira", role: "designer" as const, sources: [], selection: { id: "selection-a", version: 7 }, removalVersion: 3, canRemove: true };
const page: PresentedChatParticipantPage = { items: [person], removed: [], setupWarnings: [] };
function rawSummary(name = "Villa", nameVersion = 3) { return { project: { id: "project-a", name, status: "active", nameVersion }, counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 }, participantCount: 1, cursor: "", lastReadSequence: 0, latestMessageSequence: 0, capabilities: { canSend: true, canManageParticipants: true, canManageIssues: true, canRenameProject: true }, setupWarnings: [] }; }
const state = { runId: "run-a", generation: 2, stateVersion: 3, status: "answered", eligibleAt: "2026-10-14T00:00:00Z", resultId: "result-a", checkedAt: "2026-10-14T00:00:00Z", notified: null, routing: "not_required", canRequest: true, failureCode: null };
it("hides published prices in the background and rechecks the session-bound result on resume", async () => {
 let listener!: (state: AppStateStatus) => void;
 const subscription = jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
 const get = jest.fn().mockResolvedValueOnce({ id: "result-a", projectId: "project-a", messageId: "question-a", kind: "price", checkedAt: "2026-10-14T00:00:00Z", stale: false, commercialAccess: "allowed", facts: [], candidates: [], missingInputs: [], commercial: null, disclosurePolicy: "project-publication-v1", projectPricing: publishedPriceFixture({ state: "approved" }) }).mockRejectedValueOnce(new ApiError(403, "DENIED", "Private reason"));
 setup(clientSession, { get }); const h = harness(<ChatAssistantMessage message={question()} onDenied={jest.fn()} />); const view = await render(h.node);
 await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" }));
 await waitFor(() => expect(view.getByText("Total: ₹9,735.00")).toBeTruthy());
 expect(h.client.getQueryCache().getAll().some(query => query.queryKey.includes(3))).toBe(true);
 await act(() => listener("background"));
 expect(view.queryByText("Total: ₹9,735.00")).toBeNull();
 await act(() => listener("active"));
 await waitFor(() => expect(view.getByText("This AI answer is unavailable for your current access.")).toBeTruthy());
 expect(get).toHaveBeenCalledTimes(2); expect(view.queryByText("Total: ₹9,735.00")).toBeNull();
 await view.unmount(); h.client.clear(); subscription.mockRestore();
});
function question(authorId = "client-a") { return presentMessage({ id: "question-a", projectId: "project-a", body: "Estimate addition", author: { id: authorId, name: "Client", email: "client@example.test", role: "client" }, createdAt: "2026-10-14T00:00:00Z", sequence: 1, version: 4, clientMessageId: "question-key", attachments: [], mentions: [], replyTo: null, priority: "normal", issueStatus: null, capabilities: { canRaise: false, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }, assistant: state })!; }
it("retries an unknown removal with the same stable identity, version and idempotency key", async () => {
 const result = { items: [], removed: [{ id: person.id, name: person.name, role: person.role, removalVersion: 4, canRestore: true }], setupWarnings: [] }; const post = jest.fn().mockRejectedValueOnce(new Error("Network lost")).mockResolvedValue(result); setup(admin, { post });
 const onChanged = jest.fn(async () => { throw new Error("Refresh failed after commit"); }); const h = harness(<ChatParticipantManagement projectId="project-a" session={admin} page={page} disabled={false} onChanged={onChanged} onRefresh={jest.fn()} onDenied={jest.fn()} />); const view = await render(h.node);
 await fireEvent.press(view.getByRole("button", { name: "Remove participant Mira" })); await fireEvent.changeText(view.getByLabelText("Participant change reason"), "Assignment ended"); await fireEvent.press(view.getByRole("button", { name: "Confirm participant change" })); await waitFor(() => expect(view.getByText(/could not be confirmed/)).toBeTruthy());
 await fireEvent.press(view.getByRole("button", { name: "Confirm participant change" })); await waitFor(() => expect(onChanged).toHaveBeenCalledWith(result)); expect(post.mock.calls[0]).toEqual(post.mock.calls[1]); expect(post).toHaveBeenLastCalledWith("/projects/project-a/chat/participants/designer-a/remove", { expectedVersion: 3, reason: "Assignment ended", idempotencyKey: expect.any(String) }); expect(view.queryByText(/could not be confirmed/)).toBeNull(); await view.unmount(); h.client.clear();
});
it("uses the manually added selection identity and version for access revocation", async () => {
 const post = jest.fn().mockResolvedValue({ ...page, items: [{ ...person, selection: null }] }); setup(admin, { post }); const h = harness(<ChatParticipantManagement projectId="project-a" session={admin} page={page} disabled={false} onChanged={jest.fn()} onRefresh={jest.fn()} onDenied={jest.fn()} />); const view = await render(h.node);
 await fireEvent.press(view.getByRole("button", { name: "Revoke added access for Mira" })); await fireEvent.changeText(view.getByLabelText("Participant change reason"), "Access no longer needed"); await fireEvent.press(view.getByRole("button", { name: "Confirm participant change" })); await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/chat/participants/selection-a/revoke", expect.objectContaining({ expectedVersion: 7 }))); await view.unmount(); h.client.clear();
});
it("requires explicit review after a stale project rename and uses its refreshed version", async () => {
 const patch = jest.fn().mockRejectedValueOnce(new ApiError(409, "CONFLICT", "Project changed")).mockResolvedValue(rawSummary("New villa", 5)); setup(admin, { patch }); const close = jest.fn(); const refresh = jest.fn(async () => undefined); const h = harness(null); const element = (version: number) => <QueryClientProvider client={h.client}><ChatProjectNameDialog summary={presentChatSummary(rawSummary("Villa", version), "project-a")!} session={admin} onClose={close} onRefresh={refresh} onDenied={jest.fn()} /></QueryClientProvider>; const view = await render(element(3));
 await fireEvent.changeText(view.getByLabelText("Project name"), "New villa"); await fireEvent.press(view.getByRole("button", { name: "Save project name" })); await waitFor(() => expect(view.getByRole("button", { name: "Refresh project name" })).toBeTruthy()); expect(close).not.toHaveBeenCalled(); await view.rerender(element(4)); await fireEvent.press(view.getByRole("button", { name: "Refresh project name" })); await waitFor(() => expect(view.queryByText("Project changed")).toBeNull()); await fireEvent.changeText(view.getByLabelText("Project name"), "New villa"); await fireEvent.press(view.getByRole("button", { name: "Save project name" })); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(patch.mock.calls[1]?.[1]).toMatchObject({ expectedVersion: 4 }); await view.unmount(); h.client.clear();
});
it("keeps conversation access when a resource-specific AI answer is denied", async () => {
 setup(clientSession, { get: jest.fn().mockRejectedValue(new ApiError(403, "DENIED", "Confidential policy")) }); const denied = jest.fn(); const h = harness(<ChatAssistantMessage message={question()} onDenied={denied} />); const view = await render(h.node); await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" })); await waitFor(() => expect(view.getByText("This AI answer is unavailable for your current access.")).toBeTruthy()); expect(denied).not.toHaveBeenCalled(); expect(view.queryByText("Confidential policy")).toBeNull(); await view.unmount(); h.client.clear();
});
it("strips restricted prices and limits AI requests to the actual author client", async () => {
 const get = jest.fn().mockResolvedValue({ id: "result-a", projectId: "project-a", messageId: "question-a", kind: "price", checkedAt: "2026-10-14T00:00:00Z", stale: false, commercialAccess: "restricted", facts: [], candidates: [], missingInputs: [], narrative: [{ text: "Team will confirm", factIds: [] }], commercial: null, disclosurePolicy: "project-publication-v1" }); const post = jest.fn().mockResolvedValue(state); setup(clientSession, { get, post }); const h = harness(<ChatAssistantMessage message={question("another-client")} onDenied={jest.fn()} />); const view = await render(h.node); expect(view.queryByRole("button", { name: "Refresh AI answer" })).toBeNull(); await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" })); await waitFor(() => expect(view.getByText("Team will confirm")).toBeTruthy()); expect(view.queryByText(/999888777/)).toBeNull(); expect(view.getByText("Price details are restricted to authorised project users.")).toBeTruthy();
 await view.rerender(<QueryClientProvider client={h.client}><ChatAssistantMessage message={question()} onDenied={jest.fn()} /></QueryClientProvider>); await fireEvent.press(view.getByRole("button", { name: "Refresh AI answer" })); await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/chat/messages/question-a/assistant/request", { expectedVersion: 4, idempotencyKey: expect.any(String) })); await view.unmount(); h.client.clear();
});

it("recovers one transient AI result read without publishing an error or restricted commercial data", async () => {
 const get = jest.fn().mockRejectedValueOnce(new ApiError(503, "TEMPORARY", "private provider detail")).mockResolvedValue({ id: "result-a", projectId: "project-a", messageId: "question-a", kind: "status", checkedAt: "2026-10-15T00:00:00Z", stale: false, commercialAccess: "restricted", facts: [], candidates: [], missingInputs: [], narrative: [{ text: "Design is in progress.", factIds: [] }], commercial: null, disclosurePolicy: "project-publication-v1" });
 setup(clientSession, { get }); const h = harness(<ChatAssistantMessage message={question()} onDenied={jest.fn()} />); const view = await render(h.node);
 await fireEvent.press(view.getByRole("button", { name: "View Lisno AI answer" }));
 await waitFor(() => expect(view.getByText("Design is in progress.")).toBeTruthy());
 expect(get).toHaveBeenCalledTimes(2); expect(view.queryByText(/999888777|private provider detail/)).toBeNull();
 await view.unmount(); h.client.clear();
});
it("retains the manual request key after temporary AI congestion and explains how to retry", async () => {
 const post = jest.fn().mockRejectedValueOnce(new ApiError(429, "ASSISTANT_BUSY", "internal provider capacity")).mockResolvedValue(state);
 setup(clientSession, { post }); const h = harness(<ChatAssistantMessage message={question()} onDenied={jest.fn()} />); const view = await render(h.node);
 await fireEvent.press(view.getByRole("button", { name: "Refresh AI answer" }));
 await waitFor(() => expect(view.getByText("Lisno AI is busy. Please retry shortly.")).toBeTruthy());
 expect(view.queryByText("internal provider capacity")).toBeNull();
 await fireEvent.press(view.getByRole("button", { name: "Refresh AI answer" }));
 await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
 await view.unmount(); h.client.clear();
});

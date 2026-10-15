import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { PresentedMessage } from "./chatModel";
import { ASSISTANT_REFRESH_MS, usePendingAssistantRefresh } from "./usePendingAssistantRefresh";

let mockNetwork: ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | undefined;
const mockNetworkRemove = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({ __esModule: true, default: { addEventListener: (listener: typeof mockNetwork) => { mockNetwork = listener; listener?.({ isConnected: true, isInternetReachable: true }); return mockNetworkRemove; } } }));
const pending: readonly PresentedMessage[] = [{
 id: "question-a", projectId: "project-a", body: "What is the project status?",
 author: "Client A", authorId: "client-a", authorRole: "client",
 authorIdentity: { id: "client-a", name: "Client A", role: "client" },
 createdAt: "2026-10-15T08:00:00Z", sequence: 1, clientMessageId: "client-question-a",
 priority: "normal", version: 1, issueStatus: null, replyTo: null, attachments: [],
 capabilities: { canRaise: false, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false },
 assistant: { runId: "run-a", generation: 1, status: "ready", eligibleAt: "2026-10-15T08:00:00Z",
  resultId: null, checkedAt: null, notified: null, routing: "not_required", canRequest: false, failureCode: null }
}];
function Harness({ messages = pending, enabled = true, owner = "client-a:project-a", refresh }: { messages?: readonly PresentedMessage[]; enabled?: boolean; owner?: string; refresh: () => Promise<unknown> }) {
 usePendingAssistantRefresh({ ownerKey: owner, messages, enabled, refresh });
 return null;
}
let appChange: ((state: AppStateStatus) => void) | undefined;
const appRemove = jest.fn();
const originalState = AppState.currentState;
beforeEach(() => {
 jest.useFakeTimers(); jest.clearAllMocks();
 Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
 jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => { appChange = listener; return { remove: appRemove }; });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); Object.defineProperty(AppState, "currentState", { configurable: true, value: originalState }); });
async function tick(count = 1) { for (let i = 0; i < count; i++) await act(async () => { jest.advanceTimersByTime(ASSISTANT_REFRESH_MS); }); }

it("refreshes pending results without SSE and stops after the terminal result", async () => {
 const refresh = jest.fn(async () => undefined);
 const view = await render(<Harness refresh={refresh} />);
 await tick(); expect(refresh).toHaveBeenCalledTimes(1);
 const answered: readonly PresentedMessage[] = [{ ...pending[0]!, assistant: { ...pending[0]!.assistant!, status: "answered" } }];
 await view.rerender(<Harness refresh={refresh} messages={answered} />);
 await tick(2); expect(refresh).toHaveBeenCalledTimes(1);
 expect(appRemove).toHaveBeenCalled(); expect(mockNetworkRemove).toHaveBeenCalled();
 await view.unmount();
});
it("pauses in background, offline, for a hidden or denied thread, and cancels timers on unmount", async () => {
 const refresh = jest.fn(async () => undefined);
 const view = await render(<Harness refresh={refresh} />);
 await act(async () => appChange?.("background")); await tick(); expect(refresh).not.toHaveBeenCalled();
 await act(async () => { appChange?.("active"); mockNetwork?.({ isConnected: false, isInternetReachable: false }); });
 await tick(); expect(refresh).not.toHaveBeenCalled();
 await act(async () => mockNetwork?.({ isConnected: true, isInternetReachable: true }));
 await tick(); expect(refresh).toHaveBeenCalledTimes(1);
 await view.rerender(<Harness refresh={refresh} enabled={false} />); await tick(); expect(refresh).toHaveBeenCalledTimes(1);
 await view.rerender(<Harness refresh={refresh} />); await view.unmount(); await tick(); expect(refresh).toHaveBeenCalledTimes(1);
});
it("never overlaps refreshes and caps each pending run at sixty attempts", async () => {
 let resolve!: () => void;
 const refresh = jest.fn(() => new Promise<void>(done => { resolve = done; }));
 const view = await render(<Harness refresh={refresh} />);
 await tick(3); expect(refresh).toHaveBeenCalledTimes(1);
 await act(async () => resolve());
 refresh.mockImplementation(async () => undefined);
 await tick(65); expect(refresh).toHaveBeenCalledTimes(60);
 await view.rerender(<Harness refresh={refresh} enabled={false} />);
 await view.rerender(<Harness refresh={refresh} />); await tick(); expect(refresh).toHaveBeenCalledTimes(60);
 await view.rerender(<Harness refresh={refresh} owner="client-b:project-b" />); await tick(); expect(refresh).toHaveBeenCalledTimes(61);
 await view.unmount();
});

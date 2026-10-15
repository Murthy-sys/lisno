import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { TransferHttpError } from "../../platform/files";
import { KnowledgeDetailProvider } from "../knowledge/knowledgeDetailUi";
import { Button, CommandState, Copy, uncertain, useNativeCommand } from "./nativeWorkspace";

jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

it.each([[201, true], [302, true], [400, false], [403, false], [408, true], [409, false], [500, true]])("classifies upload response %s as uncertain=%s", (status, expected) => {
  expect(uncertain(new TransferHttpError(status, "TRANSFER_REPLY", "Response unavailable"))).toBe(expected);
});

function CommandHarness({ work }: { work: (body: object) => Promise<unknown> }) {
  const command = useNativeCommand(async () => undefined);
  if (command.accessLost) return <Copy>Access removed</Copy>;
  return <><Button label="Send command" disabled={command.locked} onPress={() => { const body = { idempotencyKey: "original-key", version: 3 }; void command.execute(() => work(body)); }} /><CommandState command={command} /></>;
}

it("retains the identical native command after a malformed successful upload response", async () => {
  const work = jest.fn().mockRejectedValueOnce(new TransferHttpError(201, "INVALID_RESPONSE", "Malformed response")).mockResolvedValueOnce({ saved: true });
  await render(<KnowledgeDetailProvider><CommandHarness work={work} /></KnowledgeDetailProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Send command" }));
  await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByRole("button", { name: "Send command" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(work).toHaveBeenCalledTimes(2));
  expect(work.mock.calls[1]![0]).toBe(work.mock.calls[0]![0]);
});

it.each([403, 409])("handles a confirmed upload %s without offering unknown retry", async status => {
  const work = jest.fn().mockRejectedValue(new TransferHttpError(status, "REJECTED", "Request rejected"));
  await render(<KnowledgeDetailProvider><CommandHarness work={work} /></KnowledgeDetailProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Send command" }));
  if (status === 403) await screen.findByText("Access removed");
  else { await screen.findByRole("button", { name: "Reload current data" }); expect(screen.getByRole("button", { name: "Send command" })).toBeDisabled(); }
  expect(screen.queryByRole("button", { name: "Retry same request" })).toBeNull();
  expect(work).toHaveBeenCalledTimes(1);
});

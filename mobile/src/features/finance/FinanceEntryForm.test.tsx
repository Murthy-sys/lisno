import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { FinanceWorkspace } from "./FinanceEntryForm";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { AuthenticatedSession } from "../../contracts/session";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => async () => undefined }));

async function setup() {
  const post = jest.fn(); const get = jest.fn();
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test" } }, runtime: { api: { authenticated: { post, get } } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
  const session = { user: { id: "finance-a", role: "finance_head" }, authorization: { permissions: ["finance.entry.create", "finance.entry.read"] } } as unknown as AuthenticatedSession;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><FinanceWorkspace projectId="project-a" session={session} hideLedger /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Record project cost" }));
  await fireEvent.changeText(screen.getByLabelText("Category"), "Site transport"); await fireEvent.changeText(screen.getByLabelText("Amount (INR)"), "123.45"); await fireEvent.changeText(screen.getByLabelText("Description"), "Approved transport receipt");
  return { post, get };
}

it("freezes an uncertain cost entry and retries exactly the same paise and request identity", async () => {
  const t = await setup(); t.post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Lost response")).mockResolvedValueOnce({});
  await fireEvent.press(screen.getByRole("button", { name: "Record cost" })); await screen.findByRole("button", { name: "Retry same cost" });
  expect(screen.getByLabelText("Amount (INR)").props.editable).toBe(false); expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Retry same cost" })); await waitFor(() => expect(t.post).toHaveBeenCalledTimes(2)); expect(t.post.mock.calls[0]).toEqual(t.post.mock.calls[1]); expect(t.post.mock.calls[0]?.[1]).toMatchObject({ amountPaise: 12345, type: "direct_spend", expenseClass: "employee_payment", idempotencyKey: expect.any(String) }); expect(t.get).not.toHaveBeenCalled();
});

it("rejects invalid calendar dates and omits expense classification for ledger overhead", async () => {
  const t = await setup(); t.post.mockResolvedValue({}); await fireEvent.changeText(screen.getByLabelText("Incurred date (YYYY-MM-DD)"), "2026-02-30"); await fireEvent.press(screen.getByRole("button", { name: "Record cost" })); await screen.findByText("Enter the incurred date as YYYY-MM-DD."); expect(t.post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Incurred date (YYYY-MM-DD)"), "2026-02-28"); await fireEvent.press(screen.getByRole("radio", { name: "Overhead" })); await fireEvent.press(screen.getByRole("button", { name: "Record cost" })); await waitFor(() => expect(t.post).toHaveBeenCalledTimes(1)); expect(t.post.mock.calls[0]?.[1]).toMatchObject({ type: "overhead", incurredAt: "2026-02-28T00:00:00.000Z" }); expect(t.post.mock.calls[0]?.[1]).not.toHaveProperty("expenseClass");
});

it("hides retained cost fields after mutation access is denied", async () => {
  const t = await setup(); t.post.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access changed"));
  await fireEvent.press(screen.getByRole("button", { name: "Record cost" }));
  await screen.findByText("This cost form is no longer available to your account.");
  expect(screen.queryByLabelText("Amount (INR)")).toBeNull();
});

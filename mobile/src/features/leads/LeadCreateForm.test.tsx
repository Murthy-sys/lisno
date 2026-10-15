import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { actor } from "../estimate-authoring/__tests__/fixtures";
import { LeadCreateForm } from "./LeadCreateForm";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
it("uses supported property types and opens the new lead's estimate by its returned stable ID", async () => {
 const post = jest.fn().mockResolvedValue({ id: "new-lead-one" }); const onCreated = jest.fn();
 jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { post } } }, environment: { status: "ready", environment: { id: "test-env" } }, session: { status: "authenticated", session: actor() } } as never);
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } }); await render(<QueryClientProvider client={client}><LeadCreateForm onCreated={onCreated} /></QueryClientProvider>);
 await fireEvent.press(screen.getByRole("button", { name: "Create lead" }));
 for (const [label, value] of [["Client name", "Client One"], ["Client email", "one@example.invalid"], ["Client mobile", "0000000000"], ["Project name", "Lake House"], ["Location", "Kochi"], ["Lead source", "Referral"], ["Next action", "Prepare estimate"]]) await fireEvent.changeText(screen.getByLabelText(label!), value!);
 await fireEvent.press(screen.getByRole("combobox", { name: "Property type" })); await fireEvent.press(await screen.findByRole("radio", { name: "Penthouse" })); await fireEvent.press(screen.getByRole("button", { name: "Save lead" }));
 await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-lead-one")); expect(post).toHaveBeenCalledWith("/leads", expect.objectContaining({ propertyType: "Penthouse", projectName: "Lake House" }));
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";
import { fireEvent, render } from "@testing-library/react-native";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeReusableValues } from "./KnowledgeReusableValues";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
jest.mock("./knowledgeRuntime", () => ({ allKnowledgePages: async (load: (page: { limit: number; offset: number }) => Promise<{ items: readonly unknown[] }>) => (await load({ limit: 100, offset: 0 })).items }));
jest.mock("./KnowledgeVendorEditor", () => ({ KnowledgeVendorEditor: () => null }));

const makeVendor = (id: string, name: string, status: "active" | "inactive" | "archived", verified: boolean | null) => ({
  id, name, code: `PV-${id.toUpperCase()}`, masterType: "vendors", status, version: 1, description: null,
  procurementSummary: { currentAddressVerifiedPhysically: verified, vendorType: "supplier" }
});
const vendors = [
  makeVendor("review", "Review Co", "active", false),
  makeVendor("verified", "Verified Co", "active", true),
  makeVendor("inactive", "Inactive Co", "inactive", false),
  makeVendor("archived", "Archived Co", "archived", false)
];

it("shows a single review-aware status without vendor codes in Configuration", async () => {
  const get = jest.fn(async () => ({ items: vendors, pagination: { total: vendors.length, limit: 100, offset: 0, hasMore: false } }));
  const context = {
    api: { listKnowledgeMasters: get }, key: (...parts: readonly unknown[]) => ["test", ...parts], ready: true,
    canRead: true, canCreate: false, canUpdate: false, canLifecycle: false
  } as unknown as KnowledgeMobileContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onClose = jest.fn();
  const view = await render(<QueryClientProvider client={client}><KnowledgeReusableValues context={context} onClose={onClose} /></QueryClientProvider>);
  await fireEvent.press(view.getByRole("combobox", { name: "Reusable value category" }));
  await fireEvent.press(view.getByRole("radio", { name: "Vendors" }));
  await view.findByRole("link", { name: "Open Review Co KPI" });
  expect(view.getByText("Under Review")).toBeTruthy();
  expect(view.getByText("Active")).toBeTruthy();
  expect(view.getByText("Inactive")).toBeTruthy();
  for (const item of vendors) expect(view.queryByText(new RegExp(item.code))).toBeNull();
  await fireEvent.press(view.getByRole("link", { name: "Open Review Co KPI" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: "/vendor/[vendorId]", params: { vendorId: "review", from: "configuration" } });
  await fireEvent.press(view.getByRole("combobox", { name: "Status" }));
  await fireEvent.press(view.getByRole("radio", { name: "Archived" }));
  expect(view.getByRole("link", { name: "Open Archived Co KPI" })).toBeTruthy();
  expect(view.getAllByText("Archived").length).toBeGreaterThan(1);
  expect(view.queryByText(/PV-ARCHIVED/)).toBeNull();
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { KnowledgeItemWorkspace } from "./KnowledgeItemWorkspace";
import { useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { ApiError } from "../../core/http/apiClient";
import type { AuthenticatedSession } from "../../contracts/session";
import type { KnowledgeItemDetail, KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./knowledgeRuntime", () => ({ ...jest.requireActual("./knowledgeRuntime"), useKnowledgeContext: jest.fn() }));
jest.mock("../../navigation/useScreenBack", () => ({ useBackInterceptor: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("./KnowledgeModeEditor", () => ({ KnowledgeModeEditor: () => null }));
jest.mock("./KnowledgeRecommendationsEditor", () => ({ KnowledgeRecommendationsEditor: () => null }));
jest.mock("./KnowledgeQualityEditor", () => ({ KnowledgeQualityEditor: () => null }));

const meta = { createdAt: "2026-09-25T00:00:00Z", updatedAt: "2026-09-25T00:00:00Z", createdById: "tester", updatedById: "tester" };
const revision = { id: "rev-a", status: "draft", revisionNumber: 2, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, ...meta };
const item = { mainLineId: "line-a", mainLineName: "Synthetic joinery", basketId: "basket-a", basketName: "Joinery", itemType: "main_line", status: "draft", version: 11, draftRevisionId: "rev-a", draftRevision: revision, activeRevisionId: null, activeRevision: null, allowedActions: ["update_section"], completeness: revision.completeness, blockers: [], warnings: [], ...meta } as unknown as KnowledgeItemDetail;
const uoms = [{ id: "area", name: "Square feet", status: "active", decimalScale: 2 }, { id: "number", name: "Number", status: "active", decimalScale: 0 }];
const page = (items: unknown[]) => ({ items, pagination: { offset: 0, limit: 100, total: items.length, hasMore: false } });
const section = (payload = { uomId: "area" }, version = 4) => ({ id: "section-a", revisionId: "rev-a", mainLineId: "line-a", sectionKey: "overview", version, payload, applicability: "configured", ...meta } as KnowledgeSectionEnvelope);

async function setup({ update = true } = {}) {
  let latestSection = section();
  const updateSection = jest.fn(async (_id, _rev, key, body) => { latestSection = { ...latestSection, sectionKey: key, payload: body.payload, version: body.expectedVersion + 1 }; return { ...latestSection, aggregateVersion: body.expectedAggregateVersion + 1 }; });
  const api = {
    getKnowledgeItem: jest.fn(async () => item), getKnowledgeHistory: jest.fn(async () => page([revision])),
    getKnowledgeSection: jest.fn(async (_id, _rev, key) => key === "overview" ? latestSection : { ...section({} as never), sectionKey: key }),
    listKnowledgeMasters: jest.fn(async type => page(type === "uoms" ? uoms : [])),
    listKnowledgeBaskets: jest.fn(async () => page([])), listKnowledgeItems: jest.fn(async () => page([])), listKnowledgeSubBaskets: jest.fn(async () => page([])),
    getKnowledgeBasketQuality: jest.fn(async () => ({ basketId: "basket-a", parameters: [], version: 1 })), updateKnowledgeSection: updateSection
  };
  const context = { api, key: (...parts: unknown[]) => ["knowledge", ...parts], scopeKey: "test:user", ready: true, canRead: true, canUpdate: update, canCreate: false, canLifecycle: false, canCreateQualityOptions: false, refresh: jest.fn(async () => undefined) } as unknown as KnowledgeMobileContext;
  jest.mocked(useKnowledgeContext).mockReturnValue(context);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onBack = jest.fn();
  await render(<QueryClientProvider client={client}><KnowledgeItemWorkspace session={{} as AuthenticatedSession} mainLineId="line-a" onBack={onBack} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }).props.accessibilityState.disabled).toBe(!update));
  return { api, context, client, onBack, setSection: (value: KnowledgeSectionEnvelope) => { latestSection = value; } };
}
async function editUom() {
  await fireEvent.press(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Number" }));
}
beforeEach(() => jest.clearAllMocks());

it("uses captured versions after background refresh and guards leaving unsaved Overview", async () => {
  const test = await setup();
  await editUom();
  await act(async () => { test.client.setQueryData(test.context.key("detail", "line-a"), { ...item, version: 22 }); });
  await fireEvent.press(screen.getByRole("button", { name: "Back to Main Baskets" }));
  expect(test.onBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(test.onBack).toHaveBeenCalledTimes(1));
  expect(test.api.updateKnowledgeSection).toHaveBeenCalledWith("line-a", "rev-a", "overview", expect.objectContaining({ expectedVersion: 4, expectedAggregateVersion: 11, payload: { uomId: "number" } }));
});

it("keeps a failed save on screen, then permits explicit discard and navigation", async () => {
  const test = await setup();
  test.api.updateKnowledgeSection.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try later"));
  await editUom();
  await fireEvent.press(screen.getByRole("button", { name: "Back to Main Baskets" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save and continue" }));
  await waitFor(() => expect(screen.getAllByText("Try later").length).toBeGreaterThan(0));
  expect(test.onBack).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Discard and continue" }));
  expect(test.onBack).toHaveBeenCalledTimes(1);
});

it("retains conflict values and requires explicit review before a fresh-version save", async () => {
  const test = await setup();
  test.api.updateKnowledgeSection.mockImplementationOnce(async () => { test.setSection(section({ uomId: "area" }, 9)); throw new ApiError(409, "VERSION_CONFLICT", "Changed"); });
  await editUom();
  await fireEvent.press(screen.getByRole("button", { name: "Save Overview" }));
  await screen.findByText("Review newer configuration");
  expect(screen.getByRole("button", { name: "Save Overview" })).toBeDisabled();
  expect(screen.getByText("Your retained values")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Use my reviewed changes" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save Overview" }));
  await waitFor(() => expect(test.api.updateKnowledgeSection).toHaveBeenCalledTimes(2));
  expect(test.api.updateKnowledgeSection).toHaveBeenLastCalledWith("line-a", "rev-a", "overview", expect.objectContaining({ expectedVersion: 9, payload: { uomId: "number" } }));
});

it("keeps overview controls and saves inaccessible without update permission", async () => {
  const test = await setup({ update: false });
  expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save Overview" })).toBeNull();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
});

it("keeps all tabs accessible and saved context expandable without obscuring the editor", async () => {
  const test = await setup();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  expect(screen.getByRole("progressbar", { name: "Configuration completeness" })).toHaveProp("accessibilityValue", expect.objectContaining({ now: 0, min: 0, max: 100 }));
  expect(screen.getByRole("button", { name: "Quick summary" })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));
  expect(screen.queryByText("Main Basket")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
  expect(screen.getByText("Main Basket")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Revision history" }));
  expect(screen.getByRole("button", { name: "View revision 2" })).toBeDisabled();
  await editUom();
  await fireEvent.press(screen.getByRole("tab", { name: "Mode" }));
  expect(screen.getByText("Unsaved Configuration changes")).toBeTruthy();
  expect(test.api.updateKnowledgeSection).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Discard and continue" }));
  expect(screen.getByRole("tab", { name: "Mode" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
});

it("retains readable activation checks and temporary-item tab restrictions", async () => {
  const test = await setup();
  await act(async () => { test.client.setQueryData(test.context.key("detail", "line-a"), { ...item, itemType: "temporary", blockers: [{ code: "MISSING_UOM", message: "uomId is required before activation." }], warnings: [{ code: "MISSING_MODE", message: "advanced is not configured." }] }); });
  await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
  expect(screen.queryByText("Unit of measure is required before activation.")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Configuration checks" }));
  expect(screen.getByText("Unit of measure is required before activation.")).toBeTruthy();
  expect(screen.getByText("Mode is not configured.")).toBeTruthy();
  expect(screen.queryByText(/uomId/)).toBeNull();
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { defaultDesignRules } from "../../../../shared/knowledge/designRules";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeSectionEnvelope, KnowledgeSectionKey } from "../../../../shared/knowledge/knowledgeTypes";
import { KnowledgeItemWorkspace } from "./KnowledgeItemWorkspace";
import { useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./knowledgeRuntime", () => ({ ...jest.requireActual("./knowledgeRuntime"), useKnowledgeContext: jest.fn() }));
jest.mock("../../navigation/useScreenBack", () => ({ useBackInterceptor: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));

const meta = { createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", createdById: "tester", updatedById: "tester" };
const revision = { id: "rev-a", status: "draft", revisionNumber: 2, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, ...meta };
const item = {
  mainLineId: "line-a", mainLineName: "Synthetic joinery", basketId: "basket-a", basketName: "Joinery",
  itemType: "main_line", status: "draft", version: 11, draftRevisionId: "rev-a", draftRevision: revision,
  activeRevisionId: null, activeRevision: null, allowedActions: ["update_section"],
  completeness: revision.completeness, blockers: [], warnings: [], ...meta
} as unknown as KnowledgeItemDetail;
const calculation = { baseRatePaise: 12_345, lowQuantityLimit: "0", impactBps: 0, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 };
const payloads: Partial<Record<KnowledgeSectionKey, KnowledgeJsonObject>> = {
  overview: { uomId: "area" },
  advanced: {
    pmcMinimumMarginBps: 1_250, pmcMarginBps: 1_750,
    subVendorMinimumMarginBps: 500, subVendorMarginBps: 1_500,
    modeCalculations: {
      pmc: calculation,
      sub_vendor: { ...calculation, baseRatePaise: 150_000, lowQuantityLimit: "6", impactBps: 1_250 },
      in_house_labor: { ...calculation, baseRatePaise: 9_800, lowQuantityLimit: "12", impactBps: 1_000 },
      in_house_material: { ...calculation, baseRatePaise: 45_025, lowQuantityLimit: "9", impactBps: 125 }
    }
  },
  pricing: {}, recommendations: {},
  design: { ...defaultDesignRules(), itemNature: "custom" } as unknown as KnowledgeJsonObject
};
const page = (items: unknown[]) => ({ items, pagination: { offset: 0, limit: 100, total: items.length, hasMore: false } });

it("keeps exact saved prices while switching real Configuration editors when Intl rejects BigInt", async () => {
  const formatDescriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, "format")!;
  const formattedValues: number[] = [];
  Object.defineProperty(Intl.NumberFormat.prototype, "format", {
    ...formatDescriptor,
    get(this: Intl.NumberFormat) {
      const nativeFormat = formatDescriptor.get!.call(this) as (value: number | bigint) => string;
      return (value: number | bigint) => {
        if (typeof value === "bigint") throw new TypeError("Cannot convert BigInt to number");
        formattedValues.push(value);
        return nativeFormat(value);
      };
    }
  });
  const api = {
    getKnowledgeItem: jest.fn(async () => item),
    getKnowledgeHistory: jest.fn(async () => page([revision])),
    getKnowledgeSection: jest.fn(async (_id: string, _revision: string, sectionKey: KnowledgeSectionKey) => ({
      id: `section-${sectionKey}`, revisionId: "rev-a", mainLineId: "line-a", sectionKey,
      version: 4, payload: payloads[sectionKey] ?? {}, applicability: "configured", ...meta
    } as KnowledgeSectionEnvelope)),
    listKnowledgeMasters: jest.fn(async (type: string) => page(type === "uoms"
      ? [{ id: "area", name: "Square feet", status: "active", decimalScale: 2 }] : [])),
    listKnowledgeBaskets: jest.fn(async () => page([{ id: "basket-a", name: "Joinery", status: "active" }])),
    listKnowledgeItems: jest.fn(async () => page([item])),
    listKnowledgeSubBaskets: jest.fn(async () => page([])),
    listKnowledgeQualityControlOptions: jest.fn(async () => ({ items: [] })),
    getKnowledgeBasketQuality: jest.fn(async () => ({
      basketId: "basket-a", basketName: "Joinery", basketStatus: "active", parameters: [],
      version: 1, revisionId: null, revisionNumber: null, contentDigest: null, updatedAt: null
    })),
    updateKnowledgeSection: jest.fn(),
    updateKnowledgeBasketQuality: jest.fn()
  };
  const context = {
    api, key: (...parts: unknown[]) => ["knowledge", ...parts], scopeKey: "test:user", ready: true,
    canRead: true, canUpdate: true, canCreate: false, canLifecycle: false, canCreateQualityOptions: false,
    refresh: jest.fn(async () => undefined)
  } as unknown as KnowledgeMobileContext;
  jest.mocked(useKnowledgeContext).mockReturnValue(context);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let view: Awaited<ReturnType<typeof render>> | undefined;

  function expectSavedPrices() {
    const summary = within(screen.getByTestId("saved-summary-mode"));
    expect(summary.getByText("Unit price ₹123.45 per Square feet · Low quantity ≤0 · Impact 0% · Min 12.5% · Max 17.5%")).toBeTruthy();
    expect(summary.getByText("Unit price ₹1,500.00 per Square feet · Low quantity ≤6 · Impact 12.5% · Min 5% · Max 15%")).toBeTruthy();
  }

  try {
    view = await render(<QueryClientProvider client={client}>
      <KnowledgeItemWorkspace session={{} as AuthenticatedSession} mainLineId="line-a" onBack={jest.fn()} />
    </QueryClientProvider>);
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await fireEvent.press(screen.getByRole("button", { name: "Quick summary" }));
    await waitFor(expectSavedPrices);

    for (let round = 0; round < 3; round++) {
      for (const name of ["Design", "Basket closure priority", "Mode", "Design", "Quality Parameter", "Overview"]) {
        await fireEvent.press(screen.getByRole("tab", { name }));
        await waitFor(() => expect(screen.getByRole("tab", { name })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true })));
        if (name === "Design") await screen.findByRole("radio", { name: "Custom" });
        if (name === "Basket closure priority") await screen.findByText("No configuration options are available in this section yet.");
        if (name === "Mode") await screen.findByRole("checkbox", { name: "PMC" });
        if (name === "Quality Parameter") await screen.findByText("No quality parameters yet.");
        if (name === "Overview") await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
        expectSavedPrices();
      }
    }

    expect(formattedValues).toEqual(expect.arrayContaining([123, 1_500, 98, 450]));
    expect(api.listKnowledgeQualityControlOptions).toHaveBeenCalledWith("frequency");
    expect(api.listKnowledgeQualityControlOptions).toHaveBeenCalledWith("performer");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(api.updateKnowledgeBasketQuality).not.toHaveBeenCalled();
    expect(screen.queryByText("Unsaved Configuration changes")).toBeNull();
  } finally {
    await view?.unmount();
    client.clear();
    Object.defineProperty(Intl.NumberFormat.prototype, "format", formatDescriptor);
  }
});

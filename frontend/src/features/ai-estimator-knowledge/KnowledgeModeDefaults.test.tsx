import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KnowledgeModeDefaults } from "./KnowledgeModeDefaults";
import * as api from "./knowledgeApi";
import type { KnowledgeItemDetail } from "./knowledgeTypes";
vi.mock("./knowledgeApi", () => ({ getKnowledgeSubBasketMargins: vi.fn(), applyKnowledgeSubBasketMargins: vi.fn() }));
const item = { mainLineId: "current", mainLineName: "Cove in Gypsum", basketId: "gypsum", subBasketId: "ceiling", version: 4,
  draftRevision: { id: "draft-current", status: "draft" }, activeRevision: null } as KnowledgeItemDetail;
function fixture(): KnowledgeSubBasketMarginSummary {
  return {
    basketId: "gypsum", subBasketId: "ceiling", source: { mainLineId: "first", mainLineName: "POP false ceiling" }, totalMainLines: 4, versionToken: "snapshot-1",
    sourceConfiguration: { revisionId: "draft-first", revisionStatus: "draft", itemVersion: 8, revisionVersion: 3, sectionVersion: 2,
      uom: { id: "sqft", name: "Square foot", code: "SQFT", decimalScale: 2 }, modes: {
        pmc: { calculations: [{ scope: "pmc", baseRatePaise: 12550, lowQuantityLimit: "15", impactBps: 1000 }] },
        sub_vendor: { calculations: [{ scope: "sub_vendor", baseRatePaise: 20800, lowQuantityLimit: "20", impactBps: 1500 }] },
        in_house: { calculations: [{ scope: "in_house", baseRatePaise: 33000, lowQuantityLimit: "8", impactBps: 750 }] }
      } },
    modes: {
      pmc: { ranges: [{ key: "margin", minimumBps: 1250, maximumBps: 1800 }], mismatchCount: 1,
        mismatches: [{ mainLineId: "unrelated", mainLineName: "Unrelated line", ranges: [], blockedReason: "Unrelated saved configuration needs review." }], canApply: false, unavailableReason: "Another main line is blocked." },
      sub_vendor: { ranges: [{ key: "margin", minimumBps: 2500, maximumBps: 3500 }], mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null },
      in_house: { ranges: [{ key: "labor", minimumBps: 2000, maximumBps: 3000 }, { key: "material", minimumBps: 2000, maximumBps: 3000 }], mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null }
    }
  };
}
function setup(current = item) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><KnowledgeModeDefaults item={current} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(fixture());
});
describe("Compact default margins", () => {
  it("shows all three ranges together without controls or extra content", async () => {
    setup();
    const panel = screen.getByRole("region", { name: "Sub-basket defaults" });
    expect(await within(panel).findByText("12.5% - 18%")).toBeVisible();
    expect(within(panel).getByText("PMC margin:")).toBeVisible();
    expect(within(panel).getByText("Sub-vendor margin:")).toBeVisible();
    expect(within(panel).getByText("In-house margin:")).toBeVisible();
    expect(within(panel).getByText("25% - 35%")).toBeVisible();
    expect(within(panel).getByText("20% - 30%")).toBeVisible();
    expect(within(panel).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("heading")).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/POP false ceiling|Saved Draft|Base rate|UOM|Low quantity|Impact|₹|Applying|first main line/i);
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps unequal Labour and Material ranges explicit", async () => {
    const data = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...data, modes: { ...data.modes, in_house: { ...data.modes.in_house,
      ranges: [{ key: "labor", minimumBps: 2500, maximumBps: 3500 }, { key: "material", minimumBps: 1500, maximumBps: 2500 }] } } });
    setup();
    expect(await screen.findByText("Labour: 25% - 35%")).toBeVisible();
    expect(screen.getByText("Material: 15% - 25%")).toBeVisible();
  });

  it("does not hide unconfigured components when other component ranges match", async () => {
    const data = fixture();
    const components = [{ id: "a", basketId: "gypsum", subBasketId: "frame", name: "Framing" }, { id: "b", basketId: "paint", subBasketId: "finish", name: "Finishing" }];
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...data,
      sourceConfiguration: { ...data.sourceConfiguration!, modes: { ...data.sourceConfiguration!.modes, in_house: { calculations: components.flatMap(component => [
        { component, scope: "in_house_labor" as const, baseRatePaise: null, lowQuantityLimit: null, impactBps: null },
        { component, scope: "in_house_material" as const, baseRatePaise: null, lowQuantityLimit: null, impactBps: null }
      ]) } } }, modes: { ...data.modes, in_house: { ...data.modes.in_house, ranges: [
        { component: components[0], key: "labor", minimumBps: 2000, maximumBps: 3000 },
        { component: components[0], key: "material", minimumBps: 2000, maximumBps: 3000 }
      ] } } });
    setup();
    const configured = (await screen.findByText("Framing")).parentElement!;
    expect(within(configured).getByText("20% - 30%")).toBeVisible();
    expect(within(screen.getByText("Finishing").parentElement!).getByText("Not configured")).toBeVisible();
  });

  it("does not substitute a configured Labour range for missing Material margins", async () => {
    const data = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...data, modes: { ...data.modes, in_house: { ...data.modes.in_house,
      ranges: [{ key: "labor", minimumBps: 2000, maximumBps: 3000 }, { key: "material", minimumBps: null, maximumBps: null }] } } });
    setup();
    expect(await screen.findByText("Labour: 20% - 30%")).toBeVisible();
    expect(screen.getByText("Material: Not configured")).toBeVisible();
  });

  it("uses explicit empty values without querying an unassigned Sub-basket", () => {
    setup({ ...item, subBasketId: null });
    expect(screen.getAllByText("Not configured")).toHaveLength(3);
    expect(api.getKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("shows loading then unavailable values without invented margins", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockRejectedValue(new Error("offline"));
    setup();
    expect(screen.getAllByText("Loading…")).toHaveLength(3);
    expect(await screen.findAllByText("Unavailable")).toHaveLength(3);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

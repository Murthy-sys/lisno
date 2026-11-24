import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import type { KnowledgeModeConfigurationScope, KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { matrixFixture } from "./knowledgeMarginMatrix.test-fixture";
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
function sharedDefaults(tier: KnowledgeModeTier) {
  return matrixFixture("gypsum", "ceiling").defaults.filter(entry => entry.tier === tier);
}
function setup(current = item, modeTier: KnowledgeModeConfigurationScope = "signature") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><KnowledgeModeDefaults item={current} modeTier={modeTier} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(fixture());
});
describe("Compact default margins", () => {
  it("shows all three ranges together without controls or extra content", async () => {
    setup(item, "default");
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
    expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledWith("gypsum", "ceiling", { modeTier: "default" });
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("isolates tier queries and never displays Signature margins while an empty tier loads", async () => {
    let resolvePremium!: (value: KnowledgeSubBasketMarginSummary) => void;
    const premium = new Promise<KnowledgeSubBasketMarginSummary>(resolve => { resolvePremium = resolve; });
    const unconfigured = { ranges: [], mismatchCount: null, mismatches: [], canApply: false, unavailableReason: "Not configured" };
    const empty: KnowledgeSubBasketMarginSummary = { ...fixture(), sourceConfiguration: null,
      modes: { pmc: unconfigured, sub_vendor: unconfigured, in_house: unconfigured } };
    const emptyTier = (tier: KnowledgeModeTier) => ({ ...empty, defaults: sharedDefaults(tier).map(entry => ({ ...entry, ranges: [], provenance: "unset" as const })) });
    vi.mocked(api.getKnowledgeSubBasketMargins).mockImplementation((_basketId, _subBasketId, options) => options?.modeTier === "premium" ? premium
      : Promise.resolve(options?.modeTier === "functional" ? emptyTier("functional") : { ...fixture(), defaults: sharedDefaults("signature") }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const panel = (modeTier: KnowledgeModeConfigurationScope) => <QueryClientProvider client={client}><KnowledgeModeDefaults item={item} modeTier={modeTier} /></QueryClientProvider>;
    const view = render(panel("signature"));
    expect(await screen.findByText("10% / 15%")).toBeVisible();
    view.rerender(panel("premium"));
    expect(screen.queryByText("10% / 15%")).not.toBeInTheDocument();
    expect(screen.getAllByText("Loading…")).toHaveLength(3);
    await waitFor(() => expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledWith("gypsum", "ceiling", { modeTier: "premium", inHouseScope: "sub_basket" }));
    resolvePremium(emptyTier("premium"));
    expect(await screen.findAllByText("Not configured")).toHaveLength(3);
    view.rerender(panel("functional"));
    expect(await screen.findAllByText("Not configured")).toHaveLength(3);
    expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledWith("gypsum", "ceiling", { modeTier: "functional", inHouseScope: "sub_basket" });
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(empty);
    view.rerender(panel("default"));
    expect(screen.queryByText("10% / 15%")).not.toBeInTheDocument();
    expect(await screen.findAllByText("Not configured")).toHaveLength(3);
    expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledWith("gypsum", "ceiling", { modeTier: "default" });
    view.rerender(panel("signature"));
    expect(await screen.findByText("10% / 15%")).toBeVisible();
    expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledTimes(4);
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("keeps unequal Labour and Material ranges explicit", async () => {
    const data = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...data, modes: { ...data.modes, in_house: { ...data.modes.in_house,
      ranges: [{ key: "labor", minimumBps: 2500, maximumBps: 3500 }, { key: "material", minimumBps: 1500, maximumBps: 2500 }] } } });
    setup(item, "default");
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
    setup(item, "default");
    const configured = (await screen.findByText("Framing")).parentElement!;
    expect(within(configured).getByText("20% - 30%")).toBeVisible();
    expect(within(screen.getByText("Finishing").parentElement!).getByText("Not configured")).toBeVisible();
  });

  it("does not substitute a configured Labour range for missing Material margins", async () => {
    const data = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...data, modes: { ...data.modes, in_house: { ...data.modes.in_house,
      ranges: [{ key: "labor", minimumBps: 2000, maximumBps: 3000 }, { key: "material", minimumBps: null, maximumBps: null }] } } });
    setup(item, "default");
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

  it("rejects another Sub-Basket's pending status even when the Main Line ID matches", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({
      ...fixture(), subBasketId: "previous-parent",
      exceptions: [{ tier: "signature", mode: "pmc", mainLineId: item.mainLineId, mainLineName: item.mainLineName,
        ranges: [{ key: "margin", minimumBps: 1200, maximumBps: 1800 }] }]
    });
    setup();
    expect(await screen.findAllByText("Unavailable")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Saved margin exceptions" })).not.toBeInTheDocument();
  });
});

it("shows owned defaults after the source line is removed and identifies the current line's awaiting-review margin", async () => {
  const saved = { tier: "signature" as const, mode: "sub_vendor" as const,
    ranges: [{ key: "margin" as const, minimumBps: 1000, maximumBps: 3000 }] };
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...fixture(), source: null, sourceConfiguration: null,
    ownedMargins: true, defaults: sharedDefaults("signature").map(row => row.mode === "sub_vendor" ? { ...saved, provenance: "approved" } : row), exceptions: [
      { ...saved, mainLineId: "current", mainLineName: "Cove in Gypsum", ranges: [{ key: "margin", minimumBps: 1500, maximumBps: 4000 }] },
      { ...saved, mainLineId: "other", mainLineName: "Sibling", ranges: [{ key: "margin", minimumBps: 500, maximumBps: 500 }] }
    ] });
  setup();
  expect(await screen.findByText("10% / 30%")).toBeVisible();
  const pending = screen.getByRole("region", { name: "Saved margin exceptions" });
  expect(pending).toHaveTextContent("15% / 40%");
  expect(pending).not.toHaveTextContent("5% / 5%");
});

it("keeps one In-house default and identifies each pending component on the current line", async () => {
  const scope = { tier: "signature", mode: "in_house" } as const;
  const entry = { ...scope, mainLineId: item.mainLineId, mainLineName: item.mainLineName };
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...fixture(), ownedMargins: true,
    defaults: sharedDefaults("signature").map(row => row.mode === "in_house" ? { ...row, resolution: "choose" } : row),
    exceptions: [{ ...entry, ranges: [], requiresDefault: true, proposals: [
      { ...entry, component: { basketId: "gypsum", subBasketId: "ceiling" }, componentName: "POP Gypsum",
        ranges: [{ key: "labor", minimumBps: 1500, maximumBps: 2000 }, { key: "material", minimumBps: 1000, maximumBps: 2000 }] },
      { ...entry, component: { basketId: "gypsum", subBasketId: "popp" }, componentName: "popp",
        ranges: [{ key: "labor", minimumBps: 2500, maximumBps: 3500 }, { key: "material", minimumBps: 2500, maximumBps: 3500 }] }
    ] }] });
  setup();
  expect(await screen.findByText("Choose shared margins")).toBeVisible();
  expect(screen.getAllByRole("term")).toHaveLength(3);
  const status = screen.getByRole("region", { name: "Saved margin exceptions" });
  expect(status).toHaveTextContent("POP Gypsum · Labour 15% / 20% · Material 10% / 20%");
  expect(status).toHaveTextContent("popp · Labour 25% / 35% · Material 25% / 35%");
  expect(status).toHaveTextContent("Choose a shared default to compare these margins.");
});

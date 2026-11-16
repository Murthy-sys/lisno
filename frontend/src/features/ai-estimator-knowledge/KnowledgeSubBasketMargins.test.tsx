import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { estimationCatalogueKeys } from "../leads/estimationCatalogueApi";
import { KnowledgeBasketCard } from "./KnowledgeBasketCard";
import { KnowledgeSubBasketMargins } from "./KnowledgeSubBasketMargins";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

vi.mock("./knowledgeApi", () => ({ getKnowledgeSubBasketMargins: vi.fn(), applyKnowledgeSubBasketMargins: vi.fn() }));

function fixture(): KnowledgeSubBasketMarginSummary {
  const mismatch = { mainLineId: "second", mainLineName: "Cove ceiling", ranges: [{ key: "margin" as const, minimumBps: 1000, maximumBps: 1500 }], blockedReason: null };
  return {
    basketId: "gypsum", subBasketId: "ceilings", source: { mainLineId: "first", mainLineName: "POP false ceiling" }, totalMainLines: 37, versionToken: "version-8",
    modes: {
      pmc: { ranges: [{ key: "margin", minimumBps: 1250, maximumBps: 1800 }], mismatchCount: 1, mismatches: [mismatch], canApply: true, unavailableReason: null },
      sub_vendor: { ranges: [{ key: "margin", minimumBps: 2500, maximumBps: 3500 }], mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null },
      in_house: { ranges: [{ key: "labor", minimumBps: 2000, maximumBps: 3000 }, { key: "material", minimumBps: 3500, maximumBps: 4500 }], mismatchCount: 1, mismatches: [{ ...mismatch, ranges: [{ key: "labor", minimumBps: 1000, maximumBps: 2000 }, { key: "material", minimumBps: 2500, maximumBps: 3500 }] }], canApply: true, unavailableReason: null }
    }
  };
}

function tierFixture(tier: KnowledgeModeTier): KnowledgeSubBasketMarginSummary {
  const initial = fixture();
  const offset = KNOWLEDGE_MODE_TIERS.indexOf(tier) * 500;
  const state = (mode: keyof typeof initial.modes) => ({ ...initial.modes[mode], ranges: initial.modes[mode].ranges.map((range) => ({
    ...range, minimumBps: range.minimumBps! + offset, maximumBps: range.maximumBps! + offset
  })) });
  return { ...initial, versionToken: `${tier}-version-8`, modes: { pmc: state("pmc"), sub_vendor: state("sub_vendor"), in_house: state("in_house") } };
}

const props = { basketId: "gypsum", subBasketId: "ceilings", subBasketName: "Ceiling activities", enabled: true, readOnly: false };
function setup(overrides: Partial<typeof props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const onToggle = vi.fn();
  const view = (next: Partial<typeof props> = {}) => {
    const current = { ...props, ...overrides, ...next };
    return <QueryClientProvider client={client}><KnowledgeBasketCard
      variant="sub" name={current.subBasketName} panelId="ceiling-items" imageUrl={null} countText="2 items on this page" expanded={false}
      onToggle={onToggle} headerDetails={<KnowledgeSubBasketMargins {...current} />}>
      <p>Children</p>
    </KnowledgeBasketCard></QueryClientProvider>;
  };
  const result = render(view());
  return { ...result, client, onToggle, enable: () => result.rerender(view({ enabled: true })), changeContext: (next: Partial<typeof props>) => result.rerender(view(next)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(fixture());
});

async function openComparison(user: ReturnType<typeof userEvent.setup>, tier = "Signature", mode = "PMC", name = props.subBasketName) {
  await user.click(screen.getByRole("button", { name: `${tier} margins for ${name}` }));
  if (mode !== "PMC") await user.click(screen.getByRole("button", { name: mode }));
  const panel = screen.getByRole("dialog", { name: `${tier} ${mode} margins` });
  await within(panel).findByRole("region", { name: "Default margin source" });
  return panel;
}

describe("Sub-Basket tier margins", () => {
  it("shows separate tier values and opens inspection-only comparisons without writing other tiers", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockImplementation(async (_basket, _sub, options) => tierFixture(options!.modeTier as KnowledgeModeTier));
    const user = userEvent.setup();
    setup();
    const tiers = screen.getByRole("group", { name: "Margin tiers for Ceiling activities" });
    expect(within(tiers).getAllByRole("button").map((button) => button.textContent)).toEqual(["Signature", "Premium", "Functional"]);
    expect(tiers).not.toHaveTextContent(/Configured|PMC|%|mismatch|Loading|Unavailable/);
    const expected = [
      { tier: "Signature", pmc: "12.5% / Max. 18%", sub: "25% / Max. 35%", labour: "Labour Min. 20% / Starting 30%", material: "Material Min. 35% / Starting 45%" },
      { tier: "Premium", pmc: "17.5% / Max. 23%", sub: "30% / Max. 40%", labour: "Labour Min. 25% / Starting 35%", material: "Material Min. 40% / Starting 50%" },
      { tier: "Functional", pmc: "22.5% / Max. 28%", sub: "35% / Max. 45%", labour: "Labour Min. 30% / Starting 40%", material: "Material Min. 45% / Starting 55%" }
    ];
    for (const values of expected) {
      const trigger = screen.getByRole("button", { name: `${values.tier} margins for Ceiling activities` });
      trigger.focus();
      await user.keyboard("{Enter}");
      let panel = screen.getByRole("dialog", { name: `${values.tier} PMC margins` });
      expect(await within(panel).findByRole("region", { name: "Default margin source" })).toHaveTextContent(values.pmc);
      expect(screen.getByRole("button", { name: "PMC" })).toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByRole("button", { name: "Sub-vendor" }));
      panel = screen.getByRole("dialog", { name: `${values.tier} Sub-vendor margins` });
      expect(within(panel).getByRole("region", { name: "Default margin source" })).toHaveTextContent(values.sub);
      await user.click(screen.getByRole("button", { name: "In-house" }));
      panel = screen.getByRole("dialog", { name: `${values.tier} In-house margins` });
      expect(within(panel).getByRole("region", { name: "Default margin source" })).toHaveTextContent(values.labour);
      expect(within(panel).getByRole("region", { name: "Default margin source" })).toHaveTextContent(values.material);
      if (values.tier !== "Signature") {
        expect(panel).toHaveTextContent(`Edit ${values.tier} margins on each Main Line`);
        expect(within(panel).queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
      }
      await user.keyboard("{Escape}");
      await waitFor(() => expect(trigger).toHaveFocus());
    }
    for (const tier of KNOWLEDGE_MODE_TIERS) expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledWith("gypsum", "ceilings", { modeTier: tier });
    expect(api.getKnowledgeSubBasketMargins).toHaveBeenCalledTimes(3);
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("keeps delayed, empty and failed tiers independent and retries only the failed tier", async () => {
    let finishPremium!: (value: KnowledgeSubBasketMarginSummary) => void;
    const premium = new Promise<KnowledgeSubBasketMarginSummary>((resolve) => { finishPremium = resolve; });
    let functionalAttempts = 0;
    vi.mocked(api.getKnowledgeSubBasketMargins).mockImplementation((_basket, _sub, options) => {
      if (options?.modeTier === "premium") return premium;
      if (options?.modeTier === "functional" && functionalAttempts++ === 0) return Promise.reject(new Error("Offline"));
      return Promise.resolve(tierFixture(options!.modeTier as KnowledgeModeTier));
    });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Premium margins for Ceiling activities" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Loading Premium margins…");
    expect(screen.queryByText("12.5%")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Functional margins for Ceiling activities" }));
    await screen.findByText(/Could not load Functional margins/);
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Functional margins" }));
    expect(await screen.findByRole("region", { name: "Default margin source" })).toHaveTextContent("22.5%");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Premium margins for Ceiling activities" }));
    const emptyMode = { ranges: [], mismatchCount: null, mismatches: [], canApply: false, unavailableReason: "Not configured" };
    await act(async () => finishPremium({ ...tierFixture("premium"), modes: { pmc: emptyMode, sub_vendor: emptyMode, in_house: emptyMode } }));
    expect(await screen.findByText("Not set")).toBeVisible();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("12.5%");
    await user.keyboard("{Escape}");
    expect(await openComparison(user)).toHaveTextContent("12.5%");
    const scopes = vi.mocked(api.getKnowledgeSubBasketMargins).mock.calls.map((call) => call[2]?.modeTier);
    expect(scopes.filter((tier) => tier === "signature")).toHaveLength(1);
    expect(scopes.filter((tier) => tier === "premium")).toHaveLength(1);
    expect(scopes.filter((tier) => tier === "functional")).toHaveLength(2);
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("rejects a mismatched Sub-Basket response without displaying its values", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...fixture(), subBasketId: "other-sub" });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Signature margins for Ceiling activities" }));
    await screen.findByText(/Could not load Signature margins/);
    expect(screen.queryByText("12.5%")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("closes old comparisons and keeps late reads separate after changing Sub-Baskets", async () => {
    let finishOldPremium!: (value: KnowledgeSubBasketMarginSummary) => void;
    const oldPremium = new Promise<KnowledgeSubBasketMarginSummary>((resolve) => { finishOldPremium = resolve; });
    vi.mocked(api.getKnowledgeSubBasketMargins).mockImplementation(async (basket, sub, options) => {
      if (sub === "ceilings" && options?.modeTier === "premium") return oldPremium;
      const summary = tierFixture(options!.modeTier as KnowledgeModeTier);
      return { ...summary, basketId: basket, subBasketId: sub, source: { mainLineId: sub, mainLineName: sub === "ceilings" ? "POP false ceiling" : "Wall finish" } };
    });
    const user = userEvent.setup();
    const { changeContext } = setup();
    await openComparison(user, "Signature", "PMC");
    expect(screen.getByRole("dialog")).toHaveTextContent("POP false ceiling");
    changeContext({ basketId: "finishes", subBasketId: "walls", subBasketName: "Wall finishes" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Premium margins for Wall finishes/ })).toBeEnabled());
    await act(async () => finishOldPremium({ ...tierFixture("premium"), modes: { ...fixture().modes, pmc: { ...fixture().modes.pmc, ranges: [{ key: "margin", minimumBps: 8000, maximumBps: 9000 }] } } }));
    const control = screen.getByRole("button", { name: /Premium margins for Wall finishes/ });
    await user.click(control);
    await screen.findByRole("region", { name: "Default margin source" });
    expect(screen.getByRole("dialog")).toHaveTextContent("17.5%");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("80%");
    expect(screen.getByRole("dialog")).toHaveTextContent("Wall finish");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("POP false ceiling");
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("updates only the originating basket cache when a Signature apply finishes after navigation", async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.applyKnowledgeSubBasketMargins>>) => void;
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    vi.mocked(api.getKnowledgeSubBasketMargins).mockImplementation(async (basket, sub, options) => ({ ...tierFixture(options!.modeTier as KnowledgeModeTier), basketId: basket, subBasketId: sub }));
    const user = userEvent.setup();
    const { client, changeContext } = setup();
    client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const cancelled = vi.spyOn(client, "cancelQueries");
    await openComparison(user, "Signature", "PMC");
    await user.click(screen.getByRole("button", { name: /Apply default/ }));
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", { mode: "pmc", versionToken: "signature-version-8" });
    changeContext({ basketId: "finishes", subBasketId: "walls", subBasketName: "Wall finishes" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Signature margins for Wall finishes/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Premium margins for Wall finishes/ }));
    const saved = { ...tierFixture("signature"), versionToken: "saved-signature" };
    await act(async () => finish({ updatedMainLineIds: ["second"], summary: saved }));
    expect(client.getQueryData(knowledgeQueryKeys.subBasketMargins("gypsum", "ceilings"))).toEqual(saved);
    expect(client.getQueryData<KnowledgeSubBasketMarginSummary>(knowledgeQueryKeys.subBasketMargins("finishes", "walls"))?.versionToken).toBe("signature-version-8");
    expect(screen.getByRole("dialog", { name: "Premium PMC margins" })).toBeVisible();
    expect(screen.queryByText(/default applied/)).not.toBeInTheDocument();
    expect(cancelled).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.subBasketMargins("gypsum", "ceilings"), exact: true });
  });

  it("retains failed refresh targets after another tier comparison resets mutation feedback", async () => {
    const user = userEvent.setup();
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockResolvedValue({ updatedMainLineIds: ["second"], summary: fixture() });
    const { client } = setup();
    const invalidations = vi.spyOn(client, "invalidateQueries").mockRejectedValueOnce(new Error("Offline"));
    await openComparison(user, "Signature", "PMC");
    await user.click(screen.getByRole("button", { name: /Apply default/ }));
    await screen.findByText(/Margins saved. Some related views could not refresh/);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/Margins saved. Some related views could not refresh/)).not.toBeInTheDocument();
    await openComparison(user, "Premium");
    invalidations.mockClear();
    await user.click(screen.getByRole("button", { name: "Retry refresh" }));
    await waitFor(() => expect(screen.queryByText(/Margins saved. Some related views could not refresh/)).not.toBeInTheDocument());
    expect(invalidations).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item("second") }, { throwOnError: true });
  });

  it("groups independent component defaults and shows every pair in the review", async () => {
    const user = userEvent.setup();
    const initial = fixture();
    const pairs = [
      { basketId: "basket-ceiling", subBasketId: "sub-frame", name: "Ceiling / Framing" },
      { basketId: "basket-finish", subBasketId: "sub-finish", name: "Finishes / Painting" }
    ].flatMap((component, index) => [
      { key: "labor" as const, minimumBps: 1000 + index * 1000, maximumBps: 2000 + index * 1000, component },
      { key: "material" as const, minimumBps: 1500 + index * 1000, maximumBps: 2500 + index * 1000, component }
    ]);
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...initial, modes: { ...initial.modes,
      in_house: { ranges: pairs, mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null } } });
    setup();
    await openComparison(user, "Signature", "In-house");
    expect(screen.getByText("Ceiling / Framing")).toBeVisible();
    expect(screen.getByText("Finishes / Painting")).toBeVisible();
    expect(screen.getByText(/Components are matched by Main basket and Sub-basket/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
  });

  it("reads full-scope defaults only when the parent is expanded and keeps header controls independent", async () => {
    const user = userEvent.setup();
    const { enable, onToggle } = setup({ enabled: false });
    expect(api.getKnowledgeSubBasketMargins).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Signature margins for Ceiling activities" })).toBeDisabled();
    enable();
    const panel = await openComparison(user);
    expect(onToggle).not.toHaveBeenCalled();
    expect(panel).toHaveTextContent("POP false ceiling");
    expect(panel).toHaveTextContent("Cove ceiling");
    expect(panel).toHaveTextContent("Compared across all 37 main lines");
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("applies only the selected mode and reviewed token, invalidates saved consumers and announces success", async () => {
    const user = userEvent.setup();
    const initial = fixture();
    const updated = { ...initial, modes: { ...initial.modes, in_house: { ...initial.modes.in_house, mismatchCount: 0, mismatches: [], canApply: false } } };
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockResolvedValue({ updatedMainLineIds: ["second"], summary: updated });
    const { client } = setup();
    const invalidations = vi.spyOn(client, "invalidateQueries");
    await openComparison(user, "Signature", "In-house");
    await user.click(screen.getByRole("button", { name: "Apply default to 1 main line" }));
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", { mode: "in_house", versionToken: "version-8" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Signature In-house default applied to 1 main line.");
    expect(screen.getByRole("button", { name: /Signature margins for Ceiling activities/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Signature margins for Ceiling activities/ })).not.toHaveTextContent(/mismatch/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /Signature margins for Ceiling activities/ })).toHaveFocus());
    expect(invalidations).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item("second") }, { throwOnError: true });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: estimationCatalogueKeys.all }, { throwOnError: true });
  });

  it("allows read-only comparison without an apply action", async () => {
    const user = userEvent.setup();
    setup({ readOnly: true });
    await openComparison(user, "Signature", "PMC");
    expect(screen.getByText("You have read-only access to these margins.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
  });

  it("shows a temporary item's Sub-vendor mismatch and clears its badge after applying the first item's default", async () => {
    const user = userEvent.setup();
    const baseline = fixture();
    const summary: KnowledgeSubBasketMarginSummary = {
      ...baseline,
      totalMainLines: 2,
      modes: {
        pmc: { ...baseline.modes.pmc, mismatchCount: 0, mismatches: [], canApply: false },
        sub_vendor: {
          ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 3500 }],
          mismatchCount: 1,
          mismatches: [{
            mainLineId: "temporary-cove",
            mainLineName: "Cove in Gypsum",
            ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 3000 }],
            blockedReason: null
          }],
          canApply: true,
          unavailableReason: null
        },
        in_house: { ...baseline.modes.in_house, mismatchCount: 0, mismatches: [], canApply: false }
      }
    };
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(summary);
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockResolvedValue({
      updatedMainLineIds: ["temporary-cove"],
      summary: {
        ...summary,
        versionToken: "version-9",
        modes: { ...summary.modes, sub_vendor: { ...summary.modes.sub_vendor, mismatchCount: 0, mismatches: [], canApply: false } }
      }
    });
    setup();
    await openComparison(user, "Signature", "Sub-vendor");
    const panel = screen.getByRole("dialog", { name: "Signature Sub-vendor margins" });
    expect(within(panel).getByText("POP false ceiling")).toBeVisible();
    expect(within(panel).getByText(/Compared across all 2 main lines, including temporary items and other pages/)).toBeVisible();
    expect(within(panel).getByText(/Only saved, configured margins are compared/)).toBeVisible();
    const mismatches = within(panel).getByRole("region", { name: "Mismatched main lines" });
    expect(mismatches).toHaveTextContent("Cove in Gypsum");
    expect(mismatches).toHaveTextContent("Min. 20% / Max. 30%");
    await user.click(within(panel).getByRole("button", { name: "Apply default to 1 main line" }));

    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      mode: "sub_vendor", versionToken: "version-8"
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const updated = await openComparison(user, "Signature", "Sub-vendor");
    expect(updated).toHaveTextContent("Min. 20% / Max. 35%");
    expect(updated).toHaveTextContent("All configured margins match this default.");
    expect(within(updated).queryByRole("region", { name: "Mismatched main lines" })).not.toBeInTheDocument();
  });

  it("shows aligned margins and blocks applying when a mismatch needs configuration", async () => {
    const user = userEvent.setup();
    const summary = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...summary, modes: {
      ...summary.modes, in_house: { ...summary.modes.in_house, canApply: false,
        unavailableReason: "Configure the missing in-house costs first.",
        mismatches: [{ ...summary.modes.in_house.mismatches[0]!, blockedReason: "Material cost is not configured." }] }
    } });
    setup();
    await openComparison(user, "Signature", "Sub-vendor");
    expect(screen.getByText("All configured margins match this default.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "In-house" }));
    expect(screen.getByText("Configure the missing in-house costs first.")).toBeVisible();
    expect(screen.getByText("Material cost is not configured.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Apply default/ })).toBeDisabled();
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("shows unknown counts and the reason when there is no first main line", async () => {
    const summary = fixture();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...summary, source: null, totalMainLines: 0, modes: {
      ...summary.modes, pmc: { ranges: [], mismatchCount: null, mismatches: [], canApply: false, unavailableReason: "Add a main line to configure its margins." }
    } });
    const user = userEvent.setup();
    setup();
    const panel = await openComparison(user);
    expect(panel).toHaveTextContent("Not set");
    expect(panel).toHaveTextContent("No main lines in this Sub-Basket.");
    expect(panel).toHaveTextContent("Add a main line to configure its margins.");
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
  });

  it("recovers an unavailable summary without showing stale values as actionable", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Signature margins for Ceiling activities" }));
    await screen.findByText(/Could not load Signature margins/);
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Signature margins" }));
    expect(await screen.findByRole("region", { name: "Default margin source" })).toHaveTextContent("12.5%");
    expect(screen.getByRole("button", { name: /Apply default/ })).toBeEnabled();
  });

  it("requires refreshing a failed mutation before allowing another apply and uses the new token", async () => {
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockRejectedValueOnce(new Error("Margins changed."));
    const user = userEvent.setup();
    setup();
    await openComparison(user, "Signature", "PMC");
    await user.click(screen.getByRole("button", { name: "Apply default to 1 main line" }));
    await screen.findByText(/Margins changed/);
    expect(screen.getByRole("button", { name: /Apply default/ })).toBeDisabled();
    vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ ...fixture(), versionToken: "version-9" });
    await user.click(screen.getByRole("button", { name: "Refresh comparison" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Apply default/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Apply default/ }));
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenLastCalledWith("gypsum", "ceilings", { mode: "pmc", versionToken: "version-9" });
  });

  it("blocks repeated submissions while saving", async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.applyKnowledgeSubBasketMargins>>) => void;
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    setup();
    await openComparison(user, "Signature", "PMC");
    const apply = screen.getByRole("button", { name: /Apply default/ });
    await user.dblClick(apply);
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledOnce();
    expect(apply).toBeDisabled();
    expect(screen.getByRole("button", { name: "In-house" })).toBeDisabled();
    await act(async () => finish({ updatedMainLineIds: ["second"], summary: fixture() }));
  });
});

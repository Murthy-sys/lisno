import { matrixFixture } from "./knowledgeMarginMatrix.test-fixture";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeSubBasketMarginSummary, MarginDefault, MarginPair } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { estimationCatalogueKeys } from "../leads/estimationCatalogueApi";
import { KnowledgeBasketCard } from "./KnowledgeBasketCard";
import { KnowledgeSubBasketMargins } from "./KnowledgeSubBasketMargins";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

vi.mock("./knowledgeApi", () => ({ getKnowledgeMarginMatrix: vi.fn(async (basketId: string, subBasketId: string) => matrixFixture(basketId, subBasketId)), getKnowledgeSubBasketMargins: vi.fn(), applyKnowledgeSubBasketMargins: vi.fn(), previewKnowledgeMarginDecision: vi.fn(), commitKnowledgeMarginDecision: vi.fn() }));

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
  vi.mocked(api.getKnowledgeMarginMatrix).mockImplementation(async (basketId, subBasketId) => matrixFixture(basketId, subBasketId));
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(fixture());
});

async function showComparison(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Compare saved Main Line margins" }));
}

async function openComparison(user: ReturnType<typeof userEvent.setup>, tier = "Signature", mode = "PMC", name = props.subBasketName) {
  await user.click(screen.getByRole("button", { name: `${tier} margins for ${name}` }));
  await showComparison(user);
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
    expect(within(tiers).getAllByRole("button", { name: /margins for/ }).map((button) => button.textContent)).toEqual(["Signature", "Premium", "Functional"]);
    expect(within(tiers).queryByText(/%/)).not.toBeInTheDocument();
    await within(tiers).findByRole("button", { name: /Review exceptions/ });
    const expected = [
      { tier: "Signature", pmc: "12.5% / Max. 18%", sub: "25% / Max. 35%", labour: "Labour Min. 20% / Starting 30%", material: "Material Min. 35% / Starting 45%" },
      { tier: "Premium", pmc: "17.5% / Max. 23%", sub: "30% / Max. 40%", labour: "Labour Min. 25% / Starting 35%", material: "Material Min. 40% / Starting 50%" },
      { tier: "Functional", pmc: "22.5% / Max. 28%", sub: "35% / Max. 45%", labour: "Labour Min. 30% / Starting 40%", material: "Material Min. 45% / Starting 55%" }
    ];
    for (const values of expected) {
      const trigger = screen.getByRole("button", { name: `${values.tier} margins for Ceiling activities` });
      trigger.focus();
      await user.keyboard("{Enter}");
      const editor = screen.getByRole("dialog", { name: `${values.tier} tier margins` });
      expect(within(editor).getByRole("button", { name: values.tier })).toHaveAttribute("aria-pressed", "true");
      expect(within(editor).getByRole("spinbutton", { name: `${values.tier} · PMC Maximum (%)` })).toBeVisible();
      await showComparison(user);
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
    await showComparison(user);
    expect(screen.getByRole("dialog")).toHaveTextContent("Loading Premium margins…");
    expect(screen.queryByText("12.5%")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Functional margins for Ceiling activities" }));
    await showComparison(user);
    await screen.findByText(/Could not load Functional margins/);
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Functional margins" }));
    expect(await screen.findByRole("region", { name: "Default margin source" })).toHaveTextContent("22.5%");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Premium margins for Ceiling activities" }));
    await showComparison(user);
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
    await showComparison(user);
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
    await showComparison(user);
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
    const invalidated = vi.spyOn(client, "invalidateQueries");
    await openComparison(user, "Signature", "PMC");
    await user.click(screen.getByRole("button", { name: /Apply default/ }));
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", { mode: "pmc", versionToken: "signature-version-8" });
    changeContext({ basketId: "finishes", subBasketId: "walls", subBasketName: "Wall finishes" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Signature margins for Wall finishes/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Premium margins for Wall finishes/ }));
    await showComparison(user);
    const saved = { ...tierFixture("signature"), versionToken: "saved-signature" };
    await act(async () => finish({ updatedMainLineIds: ["second"], summary: saved }));
    expect(client.getQueryData(knowledgeQueryKeys.subBasketMargins("gypsum", "ceilings"))).toEqual(saved);
    expect(client.getQueryData(knowledgeQueryKeys.subBasketMargins("finishes", "walls"))).toBeUndefined();
    expect(screen.getByRole("dialog", { name: "Premium PMC margins" })).toBeVisible();
    expect(screen.queryByText(/default applied/)).not.toBeInTheDocument();
    expect(cancelled).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.subBasketMargins("gypsum", "ceilings"), exact: true });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.subBasketLists("gypsum") }, { throwOnError: true });
    expect(invalidated).not.toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.subBasketLists("finishes") }, { throwOnError: true });
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
    await showComparison(user);
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

describe("Sub-Basket default edits and exception decisions", () => {
  const target = { mainLineId: "target-two", mainLineName: "Ceiling B" };
  const premium = { tier: "premium", mode: "sub_vendor" } as const;
  const pair = (min: number, max: number) => [{ key: "margin" as const, minimumBps: min, maximumBps: max }];
  const impact = { ...premium, previous: pair(2000, 3000), ranges: pair(2000, 3500),
    affected: [target], competing: [{ ...target, ...premium, ranges: pair(1500, 3000) }],
    excluded: [{ ...premium, mainLineId: "blank", mainLineName: "Ceiling C", reason: "Tier not configured." }], blockers: [] };
  const response = { basketId: "gypsum", subBasketId: "ceilings", reviewToken: "review-verified", impacts: [impact] };

  it("reviews and approves a saved Premium exception, shows competing values and refreshes the affected views", async () => {
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue(response);
    vi.mocked(api.commitKnowledgeMarginDecision).mockImplementation(async (basketId, subBasketId, input) => {
      vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue({ ...matrixFixture(basketId, subBasketId), exceptions: [], versionToken: "matrix-10" });
      return { basketId, subBasketId, operationId: input.operationId, updatedMainLineIds: [target.mainLineId], alreadyApplied: false };
    });
    const user = userEvent.setup();
    const { client, onToggle } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: /Review exceptions \(1\)/ }));
    await user.click(screen.getByRole("radio", { name: /Ceiling A.*Premium.*20% \/ 35%/ }));
    await user.click(screen.getByRole("button", { name: "Review impact" }));
    const approve = await screen.findByRole("button", { name: "Approve and apply to Premium" });
    expect(screen.getByRole("dialog")).toHaveTextContent("Ceiling B: 15% / 30%");
    expect(screen.getByRole("dialog")).toHaveTextContent("Ceiling C: Tier not configured.");
    const expected = { decision: { kind: "approve", candidate: { ...premium, mainLineId: "first" } }, versionToken: "matrix-9" };
    expect(api.previewKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", expected);
    expect(api.commitKnowledgeMarginDecision).not.toHaveBeenCalled();
    await user.dblClick(approve);
    expect(api.commitKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      ...expected, reviewToken: "review-verified", operationId: expect.any(String)
    });
    const bell = await screen.findByRole("button", { name: /Review exceptions \(0\)/ });
    await waitFor(() => expect(bell).toHaveFocus());
    expect(bell).not.toHaveTextContent("0");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toHaveTextContent("No saved margin edits are waiting for approval.");
    expect(screen.queryByRole("button", { name: "Review impact" })).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.subBasketMargins("gypsum", "ceilings") }, { throwOnError: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item(target.mainLineId) }, { throwOnError: true });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("sends the changed scopes from multiple tier tabs in one reviewed edit", async () => {
    const user = userEvent.setup();
    const matrix = matrixFixture("gypsum", "ceilings");
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue({ ...matrix, defaults: matrix.defaults.map(row =>
      row.mode === "in_house" ? { ...row, provenance: "existing", resolution: "suggested", canApplyPrefilled: true,
        ranges: [{ key: "labor", minimumBps: 1500, maximumBps: 2000 }, { key: "material", minimumBps: 1000, maximumBps: 2000 }] } : row) });
    vi.mocked(api.previewKnowledgeMarginDecision).mockImplementation(async (_basket, _sub, { decision }) => {
      if (decision.kind !== "edit") throw new Error("Expected an edit");
      return { ...response, impacts: decision.changes.map((change) => ({ ...impact, ...change, competing: [], excluded: [] })) };
    });
    setup();
    await user.click(await screen.findByRole("button", { name: "Signature margins for Ceiling activities" }));
    const first = screen.getByRole("spinbutton", { name: "Signature · PMC Maximum (%)" });
    await user.clear(first); await user.type(first, "19.75");
    await user.click(screen.getByRole("button", { name: "Functional" }));
    const last = screen.getByRole("spinbutton", { name: "Functional · Sub-vendor Maximum (%)" });
    await user.clear(last); await user.type(last, "45");
    await user.click(screen.getByRole("button", { name: "Review impact" }));
    await screen.findByRole("button", { name: "Save and apply margins" });
    expect(api.previewKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      versionToken: "matrix-9", decision: { kind: "edit", changes: [
        { tier: "signature", mode: "pmc", ranges: pair(1000, 1975) },
        { tier: "functional", mode: "sub_vendor", ranges: pair(2000, 4500) }
      ] }
    });
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("button", { name: "Save and apply margins" })).not.toBeInTheDocument();
    expect(api.commitKnowledgeMarginDecision).not.toHaveBeenCalled();
  });

  it("keeps draft percentages through tier switches and comparisons and confirms a dirty close", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup();
    const trigger = await screen.findByRole("button", { name: "Premium margins for Ceiling activities" });
    await waitFor(() => expect(trigger).toBeEnabled());
    trigger.focus();
    await user.keyboard(" ");
    const fieldName = "Premium · Sub-vendor Maximum (%)";
    const field = screen.getByRole("spinbutton", { name: fieldName });
    await user.clear(field); await user.type(field, "40");
    await user.click(screen.getByRole("button", { name: "Signature" }));
    await showComparison(user);
    expect(await screen.findByRole("button", { name: /Apply default/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Back to tier margins" }));
    await user.click(screen.getByRole("button", { name: "Premium" }));
    expect(screen.getByRole("spinbutton", { name: fieldName })).toHaveValue(40);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("spinbutton", { name: fieldName })).toHaveValue(40);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onToggle).not.toHaveBeenCalled();
    expect(api.previewKnowledgeMarginDecision).not.toHaveBeenCalled();
    expect(api.applyKnowledgeSubBasketMargins).not.toHaveBeenCalled();
  });

  it("shows configuration issues inside the selected tier while an empty bell stays unbadged", async () => {
    vi.mocked(api.getKnowledgeMarginMatrix).mockImplementation(async (basketId, subBasketId) => ({
      ...matrixFixture(basketId, subBasketId), exceptions: [],
      issues: [{ ...target, ...premium, reason: "Needs costs." }]
    }));
    const user = userEvent.setup();
    setup({ readOnly: true });
    const bell = await screen.findByRole("button", { name: /Review exceptions \(0\)/ });
    expect(bell).toBeEnabled();
    expect(bell.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: /Premium margins for/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("20% / 30%");
    await user.click(screen.getByText("Needs configuration (1)"));
    expect(screen.getByText(/Ceiling B.*Needs costs/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Functional" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("20% / 35%");
    expect(screen.queryByText(/Needs configuration/)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review impact" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(bell);
    expect(screen.getByRole("dialog")).toHaveTextContent("No saved margin edits are waiting for approval.");
  });

  it("blocks a malformed target and requires review again when the snapshot changes", async () => {
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue({ ...response,
      impacts: [{ ...impact, blockers: [{ ...target, ...premium, reason: "Invalid saved settings." }] }] });
    const user = userEvent.setup();
    const { client } = setup();
    await user.click(await screen.findByRole("button", { name: /Review exceptions \(1\)/ }));
    await user.click(screen.getByRole("radio")); await user.click(screen.getByRole("button", { name: "Review impact" }));
    expect(await screen.findByRole("button", { name: "Approve and apply to Premium" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Invalid saved settings.");
    act(() => { client.setQueryData(knowledgeQueryKeys.subBasketMarginMatrix("gypsum", "ceilings"), { ...matrixFixture("gypsum", "ceilings"), versionToken: "changed" }); });
    await screen.findByRole("button", { name: "Reload margins to review" });
    expect(screen.queryByRole("button", { name: "Approve and apply to Premium" })).not.toBeInTheDocument();
    expect(api.commitKnowledgeMarginDecision).not.toHaveBeenCalled();
  });

  it("retries an uncertain save with the same operation and retries failed refreshes without a second write", async () => {
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue(response);
    vi.mocked(api.commitKnowledgeMarginDecision).mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(async (basketId, subBasketId, input) => ({
        basketId, subBasketId, operationId: input.operationId, alreadyApplied: true, updatedMainLineIds: [target.mainLineId]
      }));
    const user = userEvent.setup();
    const { client } = setup();
    vi.spyOn(client, "invalidateQueries").mockRejectedValueOnce(new Error("Related view unavailable"));
    await user.click(await screen.findByRole("button", { name: /Review exceptions \(1\)/ }));
    await user.click(screen.getByRole("radio"));
    await user.click(screen.getByRole("button", { name: "Review impact" }));
    await user.click(await screen.findByRole("button", { name: "Approve and apply to Premium" }));
    await screen.findByText(/save response was unavailable/);
    await user.click(screen.getByRole("button", { name: "Approve and apply to Premium" }));
    expect(api.commitKnowledgeMarginDecision).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(api.commitKnowledgeMarginDecision).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    await user.click(await screen.findByRole("button", { name: "Retry refresh" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry refresh" })).not.toBeInTheDocument());
    expect(api.commitKnowledgeMarginDecision).toHaveBeenCalledTimes(2);
  });

  it("handles unavailable counts and disables writes for read-only access", async () => {
    vi.mocked(api.getKnowledgeMarginMatrix).mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    setup({ readOnly: true });
    await screen.findByText(/exception count unavailable/);
    expect(screen.queryByRole("button", { name: /Review exceptions/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry margins" }));
    await user.click(await screen.findByRole("button", { name: /Review exceptions \(1\)/ }));
    expect(screen.queryByRole("button", { name: /Edit tier margins|Review impact|Approve and apply/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio")).toBeEnabled();
  });
});

describe("Shared In-house tier margins", () => {
  const owner = { basketId: "gypsum", subBasketId: "ceilings" };
  const neighbour = { basketId: "gypsum", subBasketId: "popp" };
  const source = { mainLineId: "first", mainLineName: "POP false ceiling" };
  const inHouse = { tier: "signature", mode: "in_house" } as const;
  const approved: MarginPair[] = [{ key: "labor", minimumBps: 1500, maximumBps: 2000 },
    { key: "material", minimumBps: 1000, maximumBps: 2000 }];
  const existing: MarginPair[] = [{ key: "labor", minimumBps: 2500, maximumBps: 3500 },
    { key: "material", minimumBps: 2500, maximumBps: 3500 }];
  function matrixWith(settings: Partial<MarginDefault>) {
    const matrix = matrixFixture(owner.basketId, owner.subBasketId);
    return { ...matrix, defaults: matrix.defaults.map((entry) => entry.mode === "in_house" ? { ...entry, ...settings } : entry) };
  }
  const impact = { ...inHouse, ranges: approved, previous: approved, affected: [source], competing: [], excluded: [], blockers: [],
    componentChanges: [{ ...source, component: neighbour, componentName: "popp", previous: existing }] };

  it("offers retry when an old component-scoped matrix arrives and never opens a partial editor", async () => {
    const matrix = matrixWith({ ranges: approved, provenance: "approved", resolution: "shared" });
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValueOnce({ ...matrix, defaults: [
      ...matrix.defaults.filter(row => row.tier !== "signature" || row.mode !== "in_house"),
      { ...inHouse, component: owner, provenance: "approved", ranges: approved },
      { ...inHouse, component: neighbour, provenance: "existing", ranges: existing }
    ] }).mockResolvedValue(matrix);
    const user = userEvent.setup();
    setup();
    await screen.findByRole("button", { name: "Retry margins" });
    expect(screen.getByRole("button", { name: /Signature margins for/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry margins" }));
    const trigger = screen.getByRole("button", { name: /Signature margins for/ });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    expect(screen.getAllByRole("group", { name: "In-house" })).toHaveLength(1);
    expect(api.previewKnowledgeMarginDecision).not.toHaveBeenCalled();
  });

  it("shows four fields once per tier and reviews the opened tier’s prefilled values without an edit", async () => {
    const matrix = matrixWith({ ranges: approved, provenance: "approved", resolution: "suggested", canApplyPrefilled: true });
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue(matrix);
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue({ ...owner, impacts: [{ ...impact, componentChanges: [
      ...impact.componentChanges, { ...source, component: owner, componentName: "POP Gypsum", previous: [
        { key: "labor", minimumBps: 1200, maximumBps: null }, { key: "material", minimumBps: 1000, maximumBps: 1800 }
      ] }
    ] }], reviewToken: "prefilled" });
    const user = userEvent.setup();
    setup();
    const trigger = await screen.findByRole("button", { name: /Signature margins for/ });
    await user.click(trigger);
    for (const tier of ["Premium", "Functional", "Signature"]) {
      await user.click(screen.getByRole("button", { name: tier }));
      const panel = screen.getByRole("dialog");
      expect(Array.from(panel.querySelectorAll("fieldset legend"), legend => legend.textContent)).toEqual(["PMC", "Sub-vendor", "In-house"]);
      const section = within(panel).getByRole("group", { name: "In-house" });
      expect(within(section).getAllByRole("spinbutton")).toHaveLength(4);
      expect(within(section).getByRole("spinbutton", { name: /Labour Minimum/ })).toHaveValue(15);
      expect(within(section).getByRole("spinbutton", { name: /Labour Starting/ })).toHaveValue(20);
      expect(within(section).getByRole("spinbutton", { name: /Material Minimum/ })).toHaveValue(10);
      expect(within(section).getByRole("spinbutton", { name: /Material Starting/ })).toHaveValue(20);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.previewKnowledgeMarginDecision).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Review In-house margins" }));
    const details = await screen.findByRole("list", { name: "Component margin changes" });
    expect(details).toHaveTextContent("POP false ceiling · popp");
    expect(details).toHaveTextContent("CurrentLabour 25% / 35% · Material 25% / 35%");
    expect(details).toHaveTextContent("Labour minimum 12%, starting not configured · Material minimum 10%, starting 18%");
    expect(details).toHaveTextContent("After applyingLabour 15% / 20% · Material 10% / 20%");
    expect(screen.getByText("1 Main Line to update")).toBeVisible();
    expect(api.previewKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      versionToken: matrix.versionToken, decision: { kind: "edit", changes: [{ ...inHouse, ranges: approved }] }
    });
    expect(api.commitKnowledgeMarginDecision).not.toHaveBeenCalled();
  });

  it("keeps saved options in one editor and reviews the explicitly chosen percentages", async () => {
    const matrix = matrixWith({ resolution: "choose", ranges: [], provenance: "unset",
      choices: [{ component: owner, componentName: "POP Gypsum", ranges: approved },
        { component: neighbour, componentName: "popp", ranges: existing }] });
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue(matrix);
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue({ ...owner, impacts: [{ ...impact, ranges: existing }], reviewToken: "choice" });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: /Signature margins for/ }));
    const section = screen.getByRole("group", { name: "In-house" });
    expect(within(section).getByText("Choose shared margins")).toBeVisible();
    expect(within(section).getByRole("spinbutton", { name: /Labour Minimum/ })).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Review impact" })).toBeDisabled();
    await user.click(within(section).getByRole("radio", { name: /popp.*25%/ }));
    expect(within(section).getByRole("spinbutton", { name: /Material Starting/ })).toHaveValue(35);
    await user.click(screen.getByRole("button", { name: "Review impact" }));
    expect(api.previewKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      versionToken: matrix.versionToken, decision: { kind: "edit", changes: [{ ...inHouse, ranges: existing }] }
    });
    expect(await screen.findByRole("button", { name: "Save and apply margins" })).toBeEnabled();
  });

  it("shows conflicts and their saved values to a read-only user without inviting an edit", async () => {
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue(matrixWith({ resolution: "choose", ranges: [], provenance: "unset",
      choices: [{ component: owner, componentName: "POP Gypsum", ranges: approved },
        { component: neighbour, componentName: "popp", ranges: existing }] }));
    const user = userEvent.setup();
    setup({ readOnly: true });
    await user.click(await screen.findByRole("button", { name: /Signature margins for/ }));
    const panel = screen.getByRole("dialog");
    const section = within(panel).getByRole("group", { name: "In-house" });
    expect(section).toHaveTextContent("Choose shared margins");
    expect(section).toHaveTextContent("POP Gypsum · Labour 15% / 20% · Material 10% / 20%");
    expect(section).toHaveTextContent("popp · Labour 25% / 35% · Material 25% / 35%");
    expect(within(section).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(section).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Review impact|Review In-house margins|Save and apply/ })).not.toBeInTheDocument();
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("counts one notification for competing component proposals and submits the selected source", async () => {
    const matrix = matrixWith({ resolution: "choose", ranges: [], provenance: "unset" });
    const proposals = [{ ...source, ...inHouse, component: owner, componentName: "POP Gypsum", ranges: approved },
      { ...source, ...inHouse, component: neighbour, componentName: "popp", ranges: existing }];
    vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue({ ...matrix, exceptions: [{ ...source, ...inHouse, ranges: [], requiresDefault: true, proposals }] });
    vi.mocked(api.previewKnowledgeMarginDecision).mockResolvedValue({ ...owner, reviewToken: "from-source", impacts: [{ ...impact, previous: [], ranges: existing, affected: [], componentChanges: [] }] });
    vi.mocked(api.commitKnowledgeMarginDecision).mockImplementation(async (basketId, subBasketId, input) => {
      vi.mocked(api.getKnowledgeMarginMatrix).mockResolvedValue({ ...matrix, exceptions: [] });
      return { basketId, subBasketId, operationId: input.operationId, alreadyApplied: false, updatedMainLineIds: [] };
    });
    const user = userEvent.setup();
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: /Review exceptions \(1\)/ }));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Choose a shared default to compare these margins.")).toBeVisible();
    const review = screen.getByRole("button", { name: "Review impact" });
    expect(review).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /popp.*25%/ }));
    await user.click(review);
    expect(api.previewKnowledgeMarginDecision).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", {
      versionToken: matrix.versionToken, decision: { kind: "approve", candidate: { ...inHouse, mainLineId: source.mainLineId, component: neighbour } }
    });
    await user.click(await screen.findByRole("button", { name: "Approve and apply to Signature" }));
    await screen.findByRole("button", { name: /Review exceptions \(0\)/ });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item(source.mainLineId) }, { throwOnError: true });
  });
});

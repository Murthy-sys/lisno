import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
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

const props = { basketId: "gypsum", subBasketId: "ceilings", subBasketName: "Ceiling activities", enabled: true, readOnly: false };
function setup(overrides: Partial<typeof props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const onToggle = vi.fn();
  const view = (enabled: boolean) => <QueryClientProvider client={client}><KnowledgeBasketCard
    variant="sub" name={props.subBasketName} panelId="ceiling-items" imageUrl={null} countText="2 items on this page" expanded={false}
    onToggle={onToggle} headerDetails={<KnowledgeSubBasketMargins {...props} {...overrides} enabled={enabled} />}>
    <p>Children</p>
  </KnowledgeBasketCard></QueryClientProvider>;
  const result = render(view(overrides.enabled ?? true));
  return { ...result, client, onToggle, enable: () => result.rerender(view(true)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue(fixture());
});

describe("Sub-Basket default margins", () => {
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
    const control = await screen.findByRole("button", { name: /In-house default margins/ });
    await waitFor(() => expect(control).toHaveTextContent("2 component defaults"));
    expect(control).not.toHaveTextContent(/mismatch/i);
    await user.click(control);
    expect(screen.getByText("Ceiling / Framing")).toBeVisible();
    expect(screen.getByText("Finishes / Painting")).toBeVisible();
    expect(screen.getByText(/Components are matched by Main basket and Sub-basket/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
  });

  it("reads full-scope defaults only when the parent is expanded and keeps header controls independent", async () => {
    const user = userEvent.setup();
    const { enable, onToggle } = setup({ enabled: false });
    expect(api.getKnowledgeSubBasketMargins).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /PMC default margins/ })).toBeDisabled();
    enable();
    const button = await screen.findByRole("button", { name: /PMC default margins.*1 mismatched/ });
    expect(button).toHaveTextContent("Min. 12.5% / Max. 18%");
    expect(screen.getByRole("button", { name: /Sub-vendor default margins/ })).toHaveTextContent("Min. 25% / Max. 35%");
    expect(screen.getByRole("button", { name: /Sub-vendor default margins/ })).not.toHaveTextContent(/mismatch/i);
    expect(button).toHaveTextContent("1 mismatched");
    const inHouse = screen.getByRole("button", { name: /In-house default margins/ });
    expect(inHouse).toHaveTextContent("Labour Min. 20% / Starting 30%");
    expect(inHouse).toHaveTextContent("Material Min. 35% / Starting 45%");
    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
    const panel = screen.getByRole("dialog", { name: "PMC default margins" });
    expect(within(panel).getByText("POP false ceiling")).toBeVisible();
    expect(within(panel).getByText("Cove ceiling")).toBeVisible();
    expect(within(panel).getByText(/Compared across all 37 main lines/)).toBeVisible();
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("applies only the selected mode and reviewed token, invalidates saved consumers and announces success", async () => {
    const user = userEvent.setup();
    const initial = fixture();
    const updated = { ...initial, modes: { ...initial.modes, in_house: { ...initial.modes.in_house, mismatchCount: 0, mismatches: [], canApply: false } } };
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockResolvedValue({ updatedMainLineIds: ["second"], summary: updated });
    const { client } = setup();
    const invalidations = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: /In-house default margins.*1 mismatched/ }));
    await user.click(screen.getByRole("button", { name: "Apply default to 1 main line" }));
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledExactlyOnceWith("gypsum", "ceilings", { mode: "in_house", versionToken: "version-8" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("In-house default applied to 1 main line.");
    expect(screen.getByRole("button", { name: /In-house default margins/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /In-house default margins/ })).not.toHaveTextContent(/mismatch/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /In-house default margins/ })).toHaveFocus());
    expect(invalidations).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item("second") }, { throwOnError: true });
    expect(invalidations).toHaveBeenCalledWith({ queryKey: estimationCatalogueKeys.all }, { throwOnError: true });
  });

  it("allows read-only comparison without an apply action", async () => {
    const user = userEvent.setup();
    setup({ readOnly: true });
    await user.click(await screen.findByRole("button", { name: /PMC default margins.*1 mismatched/ }));
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
    const control = await screen.findByRole("button", { name: /Sub-vendor default margins.*1 mismatched/ });
    expect(control).toHaveTextContent("Min. 20% / Max. 35%");
    expect(screen.getAllByText("1 mismatched")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /PMC default margins/ })).not.toHaveTextContent(/mismatch/i);
    expect(screen.getByRole("button", { name: /In-house default margins/ })).not.toHaveAccessibleName(/mismatch/i);

    await user.click(control);
    const panel = screen.getByRole("dialog", { name: "Sub-vendor default margins" });
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
    const updated = screen.getByRole("button", { name: /Sub-vendor default margins/ });
    expect(updated).toHaveTextContent("Min. 20% / Max. 35%");
    expect(updated).not.toHaveTextContent(/mismatch/i);
    expect(updated).not.toHaveAccessibleName(/mismatch/i);
    expect(screen.queryByText(/\d+ mismatched/)).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /Sub-vendor default margins/ }));
    expect(screen.getByText("All configured margins match this default.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: /In-house default margins/ }));
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
    await waitFor(() => expect(screen.getByRole("button", { name: /PMC default margins/ })).toBeEnabled());
    expect(screen.getByRole("button", { name: /PMC default margins/ })).toHaveTextContent("Not set");
    expect(screen.getByRole("button", { name: /PMC default margins/ })).not.toHaveTextContent(/mismatch/i);
    await user.click(screen.getByRole("button", { name: /PMC default margins/ }));
    expect(screen.getByText("No main lines in this Sub-Basket.")).toBeVisible();
    expect(screen.getByText("Add a main line to configure its margins.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Apply default/ })).not.toBeInTheDocument();
  });

  it("recovers an unavailable summary without showing stale values as actionable", async () => {
    vi.mocked(api.getKnowledgeSubBasketMargins).mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    setup();
    await screen.findByText("Could not load default margins.");
    expect(screen.getByRole("button", { name: /PMC default margins/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry margins" }));
    expect(await screen.findByRole("button", { name: /PMC default margins.*1 mismatched/ })).toBeEnabled();
  });

  it("requires refreshing a failed mutation before allowing another apply and uses the new token", async () => {
    vi.mocked(api.applyKnowledgeSubBasketMargins).mockRejectedValueOnce(new Error("Margins changed."));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: /PMC default margins.*1 mismatched/ }));
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
    await user.click(await screen.findByRole("button", { name: /PMC default margins.*1 mismatched/ }));
    const apply = screen.getByRole("button", { name: /Apply default/ });
    await user.dblClick(apply);
    expect(api.applyKnowledgeSubBasketMargins).toHaveBeenCalledOnce();
    expect(apply).toBeDisabled();
    await act(async () => finish({ updatedMainLineIds: ["second"], summary: fixture() }));
  });
});

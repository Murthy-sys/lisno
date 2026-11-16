import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { getEstimationCatalogue, type EstimationCatalogue, type EstimationCatalogueMainLine } from "../leads/estimationCatalogueApi";
import { KnowledgeMainLineClientPreview } from "./KnowledgeMainLineClientPreview";

vi.mock("../leads/estimationCatalogueApi", async importOriginal => ({
  ...await importOriginal<typeof import("../leads/estimationCatalogueApi")>(), getEstimationCatalogue: vi.fn()
}));

const fixtureLine: EstimationCatalogueMainLine = {
  id: "line-ceiling", mainLineId: "line-ceiling", name: "POP false ceiling", basketId: "basket-ceiling", subBasketId: "sub-ceiling",
  displayOrder: 0, revisionId: "saved-draft-2", revisionStatus: "draft", revisionVersion: 4, itemVersion: 7,
  uom: { id: "sq-ft", code: "sq-ft", name: "sq-ft", decimalScale: 2 }, clientVisible: true,
  applicableTiers: ["signature", "premium"],
  tierPricing: {
    signature: { modeBaseRatesPaise: { sub_vendor: 10125, pmc: 12000, in_house: null }, inHouseComponents: [
      { id: "labor", basketId: "basket-labor", basketName: "Labor", subBasketId: "installation", subBasketName: "Installation", baseRatePaise: 91827 },
      { id: "missing", basketId: "basket-material", basketName: "Material", subBasketId: null, subBasketName: null, baseRatePaise: null }
    ] },
    premium: { modeBaseRatesPaise: { sub_vendor: 15600, pmc: null, in_house: null } }
  }
};

function catalogue(line: EstimationCatalogueMainLine = fixtureLine): EstimationCatalogue {
  return { ineligibleLineCount: 0, items: [{ id: line.basketId, name: "POP / Gypsum", displayOrder: 0,
    subBaskets: [{ id: line.subBasketId, basketId: line.basketId, name: "Ceilings", displayOrder: 0, mainLines: [line] }] }] };
}

function Harness({ mainLineId = fixtureLine.mainLineId, initiallyOpen = false, dirty = false }: { mainLineId?: string; initiallyOpen?: boolean; dirty?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} onClick={() => setOpen(true)}>Client view</button>
    <KnowledgeMainLineClientPreview open={open} mainLineId={mainLineId} mainLineName="Main Line workspace" hasUnsavedChanges={dirty}
      onClose={() => setOpen(false)} returnFocusRef={trigger} /></>;
}

function mount(props: Parameters<typeof Harness>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderHarness = (nextProps: Parameters<typeof Harness>[0]) => <QueryClientProvider client={client}><Harness {...nextProps} /></QueryClientProvider>;
  const rendered = render(renderHarness(props));
  return { ...rendered, rerenderHarness: (nextProps: Parameters<typeof Harness>[0]) => rendered.rerender(renderHarness(nextProps)), client };
}

const row = () => screen.getByRole("group", { name: "Client preview of POP false ceiling" });

describe("KnowledgeMainLineClientPreview", () => {
  beforeEach(() => { vi.mocked(getEstimationCatalogue).mockReset().mockResolvedValue(catalogue()); });

  it("shows resolved Mode details for Signature and Functional and the tier-specific Premium list without changing preview values or writing", async () => {
    const user = userEvent.setup();
    const writes = [vi.spyOn(apiClient, "post"), vi.spyOn(apiClient, "patch"), vi.spyOn(apiClient, "put"), vi.spyOn(apiClient, "delete")];
    const resolvedModeDetails = { specifications: [{ id: "mode-board", name: "Mode board", brands: [{ id: "mode-brand", name: "Saint-Gobain" }] }] };
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine,
      applicableTiers: ["signature", "premium", "functional"],
      tierPricing: { ...fixtureLine.tierPricing, functional: { modeBaseRatesPaise: { pmc: 9000, sub_vendor: 8000, in_house: null } } },
      tierDescriptions: { signature: "Signature ceiling finish.", premium: "Mode description with premium specifications.", functional: "Functional ceiling finish." },
      tierDetails: {
        signature: resolvedModeDetails,
        premium: { specifications: [{ id: "board", name: "Premium board", brands: [{ id: "brand", name: "Knauf" }] }] },
        functional: resolvedModeDetails
      }
    }));
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    const trigger = screen.getByText("Show details of tier");
    const initialRate = screen.getByLabelText("Price for POP false ceiling").textContent;
    expect(trigger.closest("label")).toBeNull();
    expect(trigger.closest("details")).not.toHaveAttribute("open");
    await user.click(trigger);
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent(initialRate!);
    for (const [tier, expected, description] of [["Signature", "Mode board (Saint-Gobain)", "Signature ceiling finish."], ["Premium", "Premium board (Knauf)", "Mode description with premium specifications."], ["Functional", "Mode board (Saint-Gobain)", "Functional ceiling finish."]]) {
      await user.click(screen.getByRole("radio", { name: `${tier} tier for POP false ceiling` }));
      const content = screen.getByRole("region", { name: `${tier} details for POP false ceiling` });
      expect(within(content).getByText(description!)).toBeVisible();
      expect(within(content).getByText(description!).nextElementSibling?.tagName).toBe("UL");
      expect(content.querySelectorAll(".estimate-line-tier-details__description")).toHaveLength(1);
      expect(within(content).getAllByRole("listitem").map(item => item.textContent)).toEqual([expected]);
      expect(trigger.closest("details")).toHaveAttribute("open");
      const selectedRate = screen.getByLabelText("Price for POP false ceiling").textContent;
      await user.click(trigger);
      await user.click(trigger);
      expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent(selectedRate!);
      expect(screen.getByRole("checkbox", { name: "Include POP false ceiling in preview" })).toBeChecked();
      expect(screen.getByRole("spinbutton", { name: "Quantity for POP false ceiling sq-ft" })).toHaveValue(1);
      expect(screen.getByLabelText("Amount for POP false ceiling")).toHaveTextContent("After save");
    }
    await user.selectOptions(screen.getByRole("combobox", { name: "Preview type" }), "special");
    expect(screen.getByText("Mode board (Saint-Gobain)")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Include POP false ceiling in preview" }));
    expect(screen.queryByText("Show details of tier")).not.toBeInTheDocument();
    expect(getEstimationCatalogue).toHaveBeenCalledTimes(1);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("shows a description without specifications and does not borrow its paragraph for another tier", async () => {
    const user = userEvent.setup();
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine,
      tierDescriptions: { signature: "Signature description only.", premium: null },
      tierDetails: { signature: null, premium: { specifications: [{ id: "board", name: "Premium board", brands: [] }] } }
    }));
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    await user.click(screen.getByText("Show details of tier"));
    expect(screen.getByText("Signature description only.")).toBeVisible();
    expect(screen.getByText("Specifications unavailable for this tier.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Premium tier for POP false ceiling" }));
    expect(screen.getByText("Premium board")).toBeVisible();
    expect(screen.queryByText("Signature description only.")).not.toBeInTheDocument();
    expect(screen.queryByText("Specifications unavailable for this tier.")).not.toBeInTheDocument();
  });

  it.each(["legacy-response", "missing-premium"] as const)("keeps details unavailable for %s instead of resolving a frontend fallback", async response => {
    const user = userEvent.setup();
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine,
      ...(response === "missing-premium" ? { tierDetails: { signature: { specifications: [{ id: "signature-only", name: "Signature-only board", brands: [] }] } } } : {})
    }));
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    await user.click(screen.getByText("Show details of tier"));
    if (response === "missing-premium") expect(screen.getByText("Signature-only board")).toBeVisible();
    else expect(screen.getByText("Details unavailable for this tier.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Premium tier for POP false ceiling" }));
    expect(screen.getByText("Details unavailable for this tier.")).toBeVisible();
    expect(screen.queryByText("Signature-only board")).not.toBeInTheDocument();
  });

  it("fetches only on opening, displays current selling data and preserves the saved-only notice", async () => {
    const user = userEvent.setup();
    mount({ dirty: true });
    expect(getEstimationCatalogue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Client view" }));
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    expect(getEstimationCatalogue).toHaveBeenCalledWith({ includeReadyNonActive: true });
    expect(screen.getByRole("dialog", { name: "Client view" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Preview uses saved configuration. Save your changes to update it.")).toBeVisible();
    expect(screen.getByText("POP / Gypsum / Ceilings")).toBeVisible();
    expect(within(row()).queryByText("sq-ft", { exact: true })).not.toBeInTheDocument();
    expect(within(row()).getByText("Qty (sq-ft)")).toBeVisible();
    expect(within(row()).getByText("Rate (₹/sq-ft)")).toBeVisible();
    expect(within(row()).getByLabelText("Price for POP false ceiling")).toHaveTextContent("₹101.25");
    expect(within(row()).getByLabelText("Amount for POP false ceiling")).toHaveTextContent("After save");
    expect(screen.queryByText(/918\.27|91,827|Configured price|Base reference/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save|submit|approve/i })).not.toBeInTheDocument();
  });

  it("keeps tier, quantity, PMC and component interactions local without exposing costs", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(apiClient, "post");
    const patch = vi.spyOn(apiClient, "patch");
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Premium tier for POP false ceiling" }));
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("₹156.00");
    await user.click(screen.getByRole("radio", { name: "Signature tier for POP false ceiling" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity for POP false ceiling" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for POP false ceiling sq-ft" })).toHaveValue(2);
    await user.selectOptions(screen.getByRole("combobox", { name: "Preview type" }), "special");
    await user.click(screen.getByRole("radio", { name: "In-house pricing mode for POP false ceiling" }));
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("From components");
    await user.click(screen.getByRole("checkbox", { name: "Labor / Installation" }));
    expect(screen.getByRole("checkbox", { name: "Labor / Installation" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Material (unavailable)" })).toBeDisabled();
    expect(screen.queryByText(/918\.27|91,827|Base reference/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "PMC pricing mode for POP false ceiling" }));
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("₹120.00");
    expect(screen.queryByRole("radio", { name: /In-house pricing/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("radio", { name: "In-house pricing mode for POP false ceiling" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Labor / Installation" })).not.toBeChecked();
    await user.selectOptions(screen.getByRole("combobox", { name: "Preview type" }), "standard");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("₹101.25");
    expect(getEstimationCatalogue).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("restores focus on Escape and refetches/reset choices on reopening", async () => {
    const user = userEvent.setup();
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, tierDescriptions: { signature: "Original finish." } }));
    mount();
    const trigger = screen.getByRole("button", { name: "Client view" });
    await user.click(trigger);
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    await user.click(screen.getByText("Show details of tier"));
    expect(screen.getByText("Original finish.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Increase quantity for POP false ceiling" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, revisionVersion: 5,
      tierDescriptions: { signature: "Updated saved finish." },
      tierPricing: { signature: { modeBaseRatesPaise: { sub_vendor: 23000, pmc: null, in_house: null } } } }));
    await user.click(trigger);
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    expect(getEstimationCatalogue).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("₹230.00");
    await user.click(screen.getByText("Show details of tier"));
    expect(screen.getByText("Updated saved finish.")).toBeVisible();
    expect(screen.queryByText("Original finish.")).not.toBeInTheDocument();
  });

  it("opens a new request even if a previous opening has not resolved", async () => {
    const user = userEvent.setup();
    let resolveOld!: (value: EstimationCatalogue) => void;
    vi.mocked(getEstimationCatalogue).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    mount();
    const trigger = screen.getByRole("button", { name: "Client view" });
    await user.click(trigger);
    await screen.findByText("Loading saved configuration…");
    await user.keyboard("{Escape}");
    vi.mocked(getEstimationCatalogue).mockResolvedValueOnce(catalogue({ ...fixtureLine, name: "Current ceiling", revisionId: "new-draft" }));
    await user.click(trigger);
    expect(await screen.findByRole("group", { name: "Client preview of Current ceiling" })).toBeVisible();
    await act(async () => resolveOld(catalogue()));
    expect(screen.queryByRole("group", { name: "Client preview of POP false ceiling" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Client preview of Current ceiling" })).toBeVisible();
    expect(getEstimationCatalogue).toHaveBeenCalledTimes(2);
  });

  it("does not treat a legacy active-only catalogue response as the current saved preview", async () => {
    vi.mocked(getEstimationCatalogue).mockResolvedValue({ ...catalogue(), readyNonActiveSupported: false });
    mount({ initiallyOpen: true });
    expect(await screen.findByText(/cannot be previewed with this catalogue version/)).toBeVisible();
    expect(screen.queryByLabelText("Price for POP false ceiling")).not.toBeInTheDocument();
  });

  it.each(["close", "backdrop"] as const)("dismisses via %s and traps keyboard focus", async control => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole("button", { name: "Client view" });
    await user.click(trigger);
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    const dialog = screen.getByRole("dialog", { name: "Client view" });
    const last = screen.getByRole("button", { name: "Increase quantity for POP false ceiling" });
    last.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const close = control === "close" ? within(dialog).getByRole("button", { name: "Close client view" })
      : screen.getAllByRole("button", { name: "Close client view" }).find(button => !dialog.contains(button))!;
    await user.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("hides cached content during refresh, shows failures and retries without fallback", async () => {
    const user = userEvent.setup();
    const { client } = mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    let reject!: (error: Error) => void;
    vi.mocked(getEstimationCatalogue).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    act(() => { void client.invalidateQueries({ queryKey: ["estimation", "catalogue"] }); });
    expect(await screen.findByText("Loading saved configuration…")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Client preview of POP false ceiling" })).not.toBeInTheDocument();
    await act(async () => reject(new Error("Unavailable")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Client preview could not be loaded");
    expect(screen.queryByLabelText("Price for POP false ceiling")).not.toBeInTheDocument();
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue());
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(await screen.findByRole("group", { name: "Client preview of POP false ceiling" })).toBeVisible();
  });

  it("never substitutes a same-name line when the requested stable ID is missing", async () => {
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, id: "different-line", mainLineId: "different-line" }));
    mount({ initiallyOpen: true });
    expect(await screen.findByText(/This Main Line is not available/)).toBeVisible();
    expect(screen.queryByLabelText("Price for POP false ceiling")).not.toBeInTheDocument();
  });

  it("does not render a client-hidden line or its pricing", async () => {
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, clientVisible: false }));
    mount({ initiallyOpen: true });
    expect(await screen.findByText("This Main Line is hidden from clients.")).toBeVisible();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Price for POP false ceiling")).not.toBeInTheDocument();
  });

  it("keeps missing prices pending instead of borrowing another tier or reporting zero", async () => {
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, applicableTiers: ["signature"],
      tierPricing: { signature: { modeBaseRatesPaise: { sub_vendor: null, pmc: null, in_house: null } } },
      modeBaseRatesPaise: { sub_vendor: 99999, pmc: null, in_house: null } }));
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    expect(screen.getByLabelText("Price for POP false ceiling")).toHaveTextContent("Pending");
    expect(screen.getByText(/Price is unavailable for the selected mode and tier/)).toBeVisible();
    expect(screen.getByRole("radio", { name: "Signature tier for POP false ceiling" })).toBeDisabled();
    expect(screen.queryByText(/999\.99|₹0\.00/)).not.toBeInTheDocument();
  });

  it("keeps required dimensions unset and uses the shared quantity calculation", async () => {
    const user = userEvent.setup();
    vi.mocked(getEstimationCatalogue).mockResolvedValue(catalogue({ ...fixtureLine, dimensionsMandatory: true,
      dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "sq-ft", decimalScale: 2 } }));
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    expect(screen.getByLabelText("Quantity for POP false ceiling sq-ft")).toHaveTextContent("Pending");
    expect(screen.getByRole("textbox", { name: "Length (ft) for POP false ceiling" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Width (ft) for POP false ceiling" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Height (ft) for POP false ceiling" })).toHaveValue("");
    await user.type(screen.getByRole("textbox", { name: "Length (ft) for POP false ceiling" }), "3");
    await user.type(screen.getByRole("textbox", { name: "Width (ft) for POP false ceiling" }), "4");
    await user.type(screen.getByRole("textbox", { name: "Height (ft) for POP false ceiling" }), "8");
    expect(screen.getByLabelText("Quantity for POP false ceiling sq-ft")).toHaveTextContent("12");
    expect(screen.getByLabelText("Amount for POP false ceiling")).toHaveTextContent("After save");
  });

  it("does not display a late response from a different Main Line", async () => {
    let resolveFirst!: (value: EstimationCatalogue) => void;
    vi.mocked(getEstimationCatalogue).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(catalogue({ ...fixtureLine, mainLineId: "line-paint", id: "line-paint", name: "Painting", revisionId: "paint-draft" }));
    const { rerenderHarness } = mount({ initiallyOpen: true });
    expect(await screen.findByText("Loading saved configuration…")).toBeVisible();
    rerenderHarness({ initiallyOpen: true, mainLineId: "line-paint" });
    expect(await screen.findByRole("group", { name: "Client preview of Painting" })).toBeVisible();
    await act(async () => resolveFirst(catalogue()));
    expect(screen.queryByRole("group", { name: "Client preview of POP false ceiling" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Client preview of Painting" })).toBeVisible();
  });

  it("renders a direct temporary Main Line only from its matching basket", async () => {
    const response = catalogue();
    response.items[0]!.subBaskets = [];
    response.items[0]!.directTemporaryItems = [{ ...fixtureLine, itemType: "temporary", subBasketId: null }];
    vi.mocked(getEstimationCatalogue).mockResolvedValue(response);
    mount({ initiallyOpen: true });
    expect(await screen.findByRole("group", { name: "Client preview of POP false ceiling" })).toBeVisible();
    expect(screen.getByText("POP / Gypsum")).toBeVisible();
  });

  it("has no automated accessibility violations in the open preview", async () => {
    mount({ initiallyOpen: true });
    await screen.findByRole("group", { name: "Client preview of POP false ceiling" });
    const result = await axe.run(screen.getByRole("dialog", { name: "Client view" }), { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});

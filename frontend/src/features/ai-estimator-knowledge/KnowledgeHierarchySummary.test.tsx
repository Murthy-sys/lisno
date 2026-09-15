import axe from "axe-core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeHierarchySummary, type KnowledgeHierarchySummaryProps } from "./KnowledgeHierarchySummary";
import type { SavedSummaryGroup } from "./knowledgeSavedSummaryTypes";

const item: KnowledgeHierarchySummaryProps["item"] = {
  basketName: " Interior finishes ",
  subBasketId: "sub-basket-private-id",
  subBasketName: " Ceiling finishes ",
  mainLineName: " Painted ceiling "
};

describe("KnowledgeHierarchySummary", () => {
  const mode: SavedSummaryGroup = {
    key: "mode", label: "Mode", notices: [],
    preview: [{ key: "modes", label: "Configured modes", value: "PMC, Sub-Vendor" }],
    details: [{ key: "margin", label: "PMC Margin", value: "0.00%" },
      { key: "description", label: "Shared description", value: "Saved description. ".repeat(30) },
      { key: "custom", label: "Extra protection", value: "No" }]
  };

  it("shows compact saved highlights and keyboard-accessible complete details", async () => {
    const user = userEvent.setup();
    render(<main><KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="first" /></main>);
    const group = screen.getByRole("region", { name: "Mode saved summary" });
    expect(group).toHaveTextContent("PMC, Sub-Vendor");
    expect(group).not.toHaveTextContent("0.00%");
    const toggle = within(group).getByRole("button", { name: "Show Mode details" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(group).toHaveTextContent("0.00%");
    expect(group).toHaveTextContent("No");
    await user.click(within(group).getByRole("button", { name: "Show full value: Mode, Shared description" }));
    expect(group).toHaveTextContent(mode.details[1].value.trim());
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(group).getByRole("button", { name: "Hide Mode details" }));
    expect(group).toHaveTextContent("PMC, Sub-Vendor");
  });

  it("keeps independent loading, error/retry and explicit empty states alongside available data", async () => {
    let retries = 0;
    const user = userEvent.setup();
    render(<KnowledgeHierarchySummary item={item} groups={[
      { key: "overview", label: "Overview", preview: [], details: [], notices: [{ key: "overview", tone: "neutral", message: "Loading Overview…" }] },
      { ...mode, notices: [{ key: "advanced", tone: "error", message: "Mode configuration: could not load saved data.", onRetry: () => { retries++; } }] },
      { key: "recommendations", label: "Recommendation & Exclusions", preview: [], details: [], notices: [], emptyMessage: "Not applicable" },
      { key: "quality", label: "Quality Parameters", preview: [], details: [], notices: [], emptyMessage: "Not configured" }
    ]} />);
    expect(screen.getByText("Loading Overview…")).toBeVisible();
    expect(screen.getByText("PMC, Sub-Vendor")).toBeVisible();
    expect(screen.getByText("Shared checklist")).toBeVisible();
    expect(screen.getByText("Not applicable")).toBeVisible();
    expect(screen.getByText("Not configured")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Retry Mode:/ }));
    expect(retries).toBe(1);
  });

  it("keeps the title outside a named focusable region containing hierarchy and all saved groups", () => {
    render(<KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="first" />);

    const summary = screen.getByRole("region", { name: "Quick summary" });
    const body = within(summary).getByRole("region", { name: "Quick summary details" });
    expect(body).toHaveAttribute("tabindex", "0");
    expect(within(body).queryByRole("heading", { level: 2, name: "Quick summary" })).not.toBeInTheDocument();
    expect(within(summary).getByRole("heading", { level: 2, name: "Quick summary" })).toBeVisible();
    expect(within(body).getByText("Interior finishes")).toBeVisible();
    expect(within(body).getByText("Saved configuration")).toBeVisible();
    expect(within(body).getByRole("region", { name: "Mode saved summary" })).toBeVisible();
  });

  it("allows normal Tab entry, movement to disclosure controls and exit from the scrolling region", async () => {
    const user = userEvent.setup();
    render(<main>
      <button>Before summary</button>
      <KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="first" />
      <button>After summary</button>
    </main>);

    screen.getByRole("button", { name: "Before summary" }).focus();
    await user.tab();
    expect(screen.getByRole("region", { name: "Quick summary details" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Show Mode details" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After summary" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Show Mode details" })).toHaveFocus();
  });

  it.each([
    ["Main Line", "line-2:revision-1:basket-1"],
    ["revision", "line-1:revision-2:basket-1"],
    ["Main Basket", "line-1:revision-1:basket-2"]
  ])("resets scrolling and expanded details when the %s identity changes", async (_identity, nextSourceKey) => {
    const user = userEvent.setup();
    const view = render(<KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="line-1:revision-1:basket-1" />);
    await user.click(screen.getByRole("button", { name: "Show Mode details" }));
    await user.click(screen.getByRole("button", { name: "Show full value: Mode, Shared description" }));
    const previousBody = screen.getByRole("region", { name: "Quick summary details" });
    previousBody.scrollTop = 400;

    view.rerender(<KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey={nextSourceKey} />);
    const nextBody = screen.getByRole("region", { name: "Quick summary details" });
    expect(nextBody).not.toBe(previousBody);
    expect(nextBody.scrollTop).toBe(0);
    expect(screen.getByRole("button", { name: "Show Mode details" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Mode details" }));
    expect(screen.getByRole("button", { name: "Show full value: Mode, Shared description" })).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves scroll, focus and disclosures when confirmed data refreshes for the same source", async () => {
    const user = userEvent.setup();
    const view = render(<KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="line-1:revision-1:basket-1" />);
    await user.click(screen.getByRole("button", { name: "Show Mode details" }));
    await user.click(screen.getByRole("button", { name: "Show full value: Mode, Shared description" }));
    const body = screen.getByRole("region", { name: "Quick summary details" });
    body.focus();
    body.scrollTop = 400;

    view.rerender(<KnowledgeHierarchySummary item={{ ...item }} groups={[{
      ...mode, details: mode.details.map(row => row.key === "margin" ? { ...row, value: "15.00%" } : { ...row }),
      notices: [{ key: "refresh", tone: "warning", message: "Showing last saved data while refreshing." }]
    }]} sourceKey="line-1:revision-1:basket-1" />);

    expect(screen.getByRole("region", { name: "Quick summary details" })).toBe(body);
    expect(body.scrollTop).toBe(400);
    expect(body).toHaveFocus();
    expect(screen.getByRole("button", { name: "Hide Mode details" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Show less: Mode, Shared description" })).toHaveAttribute("aria-expanded", "true");
    expect(body).toHaveTextContent("15.00%");
    expect(body).toHaveTextContent(mode.details[1].value.trim());
    expect(body).toHaveTextContent("Showing last saved data while refreshing.");
  });

  describe.each(["group", "long value"] as const)("%s disclosure focus visibility", disclosure => {
    it.each([
      ["above", 70, 364],
      ["below", 310, 436],
      ["inside", 140, 400]
    ] as const)("minimally adjusts only the summary when the focused toggle is %s its viewport", async (_position, toggleTop, expectedScrollTop) => {
      const user = userEvent.setup();
      render(<main><KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="first" /></main>);
      await user.click(screen.getByRole("button", { name: "Show Mode details" }));
      if (disclosure === "long value") await user.click(screen.getByRole("button", { name: "Show full value: Mode, Shared description" }));
      const toggle = screen.getByRole("button", { name: disclosure === "group" ? "Hide Mode details" : "Show less: Mode, Shared description" });
      const body = screen.getByRole("region", { name: "Quick summary details" });
      const main = screen.getByRole("main");
      Object.defineProperties(body, { clientHeight: { configurable: true, value: 200 }, clientTop: { configurable: true, value: 2 } });
      vi.spyOn(body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 220, 204));
      vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue(new DOMRect(0, toggleTop, 150, 24));
      const scrollIntoView = vi.fn();
      Object.defineProperty(toggle, "scrollIntoView", { configurable: true, value: scrollIntoView });
      const scrollWindow = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      const priorDocumentScroll = document.documentElement.scrollTop;
      document.documentElement.scrollTop = 125;
      main.scrollTop = 75;
      body.scrollTop = 400;
      toggle.focus();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveFocus();
      expect(body.scrollTop).toBe(expectedScrollTop);
      expect(main.scrollTop).toBe(75);
      expect(document.documentElement.scrollTop).toBe(125);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollWindow).not.toHaveBeenCalled();
      document.documentElement.scrollTop = priorDocumentScroll;
      scrollWindow.mockRestore();
    });

    it("does not move scrolling for an unfocused toggle", async () => {
      const user = userEvent.setup();
      render(<KnowledgeHierarchySummary item={item} groups={[mode]} sourceKey="first" />);
      await user.click(screen.getByRole("button", { name: "Show Mode details" }));
      if (disclosure === "long value") await user.click(screen.getByRole("button", { name: "Show full value: Mode, Shared description" }));
      const toggle = screen.getByRole("button", { name: disclosure === "group" ? "Hide Mode details" : "Show less: Mode, Shared description" });
      const body = screen.getByRole("region", { name: "Quick summary details" });
      Object.defineProperties(body, { clientHeight: { configurable: true, value: 200 }, clientTop: { configurable: true, value: 2 } });
      vi.spyOn(body, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 220, 204));
      vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 150, 24));
      body.scrollTop = 400;
      body.focus();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(body).toHaveFocus();
      expect(body.scrollTop).toBe(400);
    });
  });

  it("shows an accessible compact hierarchy with trimmed names and no actions or IDs", async () => {
    render(<main><KnowledgeHierarchySummary item={item} /></main>);

    const summary = screen.getByRole("region", { name: "Quick summary" });
    expect(within(summary).getByRole("heading", { level: 2, name: "Quick summary" })).toBeVisible();
    expect(within(summary).getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Main Basket", "Sub-Basket", "Main Line"
    ]);
    expect(within(summary).getAllByRole("definition").map((definition) => definition.textContent)).toEqual([
      "Interior finishes", "Ceiling finishes", "Painted ceiling"
    ]);
    expect(within(summary).queryByRole("button")).not.toBeInTheDocument();
    expect(within(summary).queryByRole("link")).not.toBeInTheDocument();
    expect(summary).not.toHaveTextContent(item.subBasketId!);

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(result.violations).toEqual([]);
  });

  it.each([undefined, null, ""])("shows Not assigned for absent Sub-Basket ID %s even with a stale name", (subBasketId) => {
    render(<KnowledgeHierarchySummary item={{ ...item, subBasketId }} />);

    expect(screen.getByText("Not assigned")).toBeVisible();
    expect(screen.queryByText("Ceiling finishes")).not.toBeInTheDocument();
    expect(screen.queryByText("Name unavailable")).not.toBeInTheDocument();
  });

  it.each([undefined, null, "", "   "])("keeps an assigned Sub-Basket distinct when its name is %s", (subBasketName) => {
    render(<KnowledgeHierarchySummary item={{ ...item, subBasketName }} />);

    expect(screen.getByText("Name unavailable")).toBeVisible();
    expect(screen.queryByText("Not assigned")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(item.subBasketId!);
  });

  it("identifies unavailable Basket and Main Line names without inventing values", () => {
    render(<KnowledgeHierarchySummary item={{ ...item, basketName: " ", mainLineName: "" }} />);

    expect(screen.getAllByRole("definition").map((definition) => definition.textContent)).toEqual([
      "Name unavailable", "Ceiling finishes", "Name unavailable"
    ]);
  });

  it("updates the entire hierarchy from replacement item props without retaining previous names", () => {
    const { rerender } = render(<KnowledgeHierarchySummary item={item} />);

    rerender(<KnowledgeHierarchySummary item={{
      basketName: "Furniture",
      subBasketId: null,
      subBasketName: null,
      mainLineName: "TV unit"
    }} />);

    expect(screen.getAllByRole("definition").map((definition) => definition.textContent)).toEqual([
      "Furniture", "Not assigned", "TV unit"
    ]);
    expect(screen.queryByText("Interior finishes")).not.toBeInTheDocument();
    expect(screen.queryByText("Ceiling finishes")).not.toBeInTheDocument();
    expect(screen.queryByText("Painted ceiling")).not.toBeInTheDocument();
  });

  it("keeps complete long names available without a disclosure action", () => {
    const longName = "Decorative ceiling finishes for living rooms, dining rooms and connected circulation areas";
    render(<KnowledgeHierarchySummary item={{ ...item, mainLineName: longName }} />);

    expect(screen.getByText(longName)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

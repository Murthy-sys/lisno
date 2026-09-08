import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeTemporaryMainLineInfo } from "./KnowledgeTemporaryMainLineInfo";
import type { KnowledgeTemporaryMainLineReference } from "./knowledgeTypes";

const reference: KnowledgeTemporaryMainLineReference = {
  mainLineId: "source-ceiling", mainLineName: "POP False Ceiling", basketId: "basket-finishes", basketName: "Finishes",
  subBasketId: "sub-ceilings", subBasketName: "Ceilings", status: "active", revisionId: "active-revision", revisionStatus: "active",
  rules: [{ id: "rule-1", trigger: "removed", action: "add", requirement: "can", reason: "Use a surface fitting when the ceiling is removed.", active: true }]
};
function setup(linkedMainLines: readonly KnowledgeTemporaryMainLineReference[] | undefined, compact = false, onOpenMainLine?: (id: string) => void) {
  return render(<MemoryRouter><main><h1>Temporary fixture</h1>{compact && <><h2>Main Basket</h2><h3>Temporary fixture card</h3></>}
    <KnowledgeTemporaryMainLineInfo item={{ itemType: "temporary", linkedMainLines }} compact={compact} onOpenMainLine={onOpenMainLine} /></main></MemoryRouter>);
}
describe("temporary item Main Line info", () => {
  it("groups source identities, distinguishes active and draft references and displays reasons and disabled rules", async () => {
    const draft: KnowledgeTemporaryMainLineReference = { ...reference, revisionId: "draft-revision", revisionStatus: "draft", rules: [{ ...reference.rules[0], id: "disabled", active: false }] };
    setup([reference, draft, { ...reference, mainLineId: "other", mainLineName: "Display Unit", basketName: "Carpentry", subBasketId: null, subBasketName: null }]);
    expect(screen.getAllByRole("link", { name: "POP False Ceiling" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Display Unit" })).toHaveAttribute("href", "/admin/configuration/estimation/items/other");
    expect(screen.getByText("Main Basket · Finishes · Sub Basket · Ceilings")).toBeVisible();
    expect(screen.getByText("Draft reference")).toBeVisible();
    expect(screen.getAllByText("Active reference")).toHaveLength(2);
    expect(screen.getByText(/Disabled rule/)).toBeVisible();
    expect(screen.getAllByText(reference.rules[0].reason, { exact: false })).toHaveLength(3);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows compact name and Basket context on cards without repeating all rule explanations", () => {
    setup([reference], true);
    expect(screen.getByRole("heading", { name: "Main Line info", level: 4 })).toBeVisible();
    expect(screen.getByRole("link", { name: "POP False Ceiling" })).toBeVisible();
    expect(screen.queryByText(/Use a surface fitting/)).not.toBeInTheDocument();
  });

  it("distinguishes an unlinked saved item from unavailable response data", () => {
    const view = setup([]);
    expect(screen.getByText(/No saved Main Line reference yet/)).toBeVisible();
    view.unmount(); setup(undefined);
    expect(screen.getByText(/Main Line details are unavailable/)).toBeVisible();
    expect(screen.queryByText(/No saved Main Line/)).not.toBeInTheDocument();
  });

  it("routes ordinary activation through the workspace navigation guard", async () => {
    const onOpen = vi.fn(); setup([reference], false, onOpen);
    await userEvent.setup().click(screen.getByRole("link", { name: "POP False Ceiling" }));
    expect(onOpen).toHaveBeenCalledWith(reference.mainLineId);
  });

  it("does not add Main Line info to regular Main Lines", () => {
    const { container } = render(<MemoryRouter><KnowledgeTemporaryMainLineInfo item={{ itemType: "main_line", linkedMainLines: [reference] }} /></MemoryRouter>);
    expect(within(container).queryByRole("heading")).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeReferenceContextRail } from "./KnowledgeReferenceContextRail";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasketQuality, KnowledgeItemDetail, KnowledgeMaster } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ getKnowledgeBasketQuality: vi.fn(), getKnowledgeSection: vi.fn() }));

const item = { mainLineId: "line-gypsum", mainLineName: "Gypsum wall panel", basketId: "basket-gypsum", basketName: "Gypsum", subBasketName: "Wall panels", description: "Vertical decorative panel", uomId: "active-uom" } as KnowledgeItemDetail;
const quality: KnowledgeBasketQuality = { basketId: item.basketId, basketName: item.basketName, basketStatus: "active", version: 7, revisionId: "checklist-3", revisionNumber: 3, contentDigest: null, updatedAt: null, parameters: [{ id: "check-one", label: "Board thickness", type: "boolean" }, { id: "check-two", label: "Joint finish", type: "text" }] };
const uoms = [{ id: "active-uom", name: "Square metre" }, { id: "draft-uom", name: "Square foot" }] as KnowledgeMaster[];

function setup(section: "recommendations" | "quality", dirty = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><KnowledgeReferenceContextRail section={section} item={item} revisionId="draft-one" uoms={uoms} uomState={{ status: "ready" }} dirty={dirty} saving={false}>
    <section aria-label="Original saved summary">Existing summary values</section>
  </KnowledgeReferenceContextRail></QueryClientProvider>);
  return { client, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getKnowledgeSection).mockResolvedValue({
    id: "overview-one", mainLineId: item.mainLineId, revisionId: "draft-one", sectionKey: "overview", applicability: "configured",
    version: 1, createdById: "author", updatedById: "author", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z",
    payload: { uomId: "draft-uom" }
  });
  vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue(quality);
});

describe("reference tab context", () => {
  it("reads the selected revision's saved UOM and keeps unsupported reference values absent", async () => {
    const user = userEvent.setup();
    setup("recommendations");
    expect(await screen.findByText("Square foot")).toBeVisible();
    expect(api.getKnowledgeSection).toHaveBeenCalledWith(item.mainLineId, "draft-one", "overview");
    expect(screen.queryByText("Square metre")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Quick Info" })).toHaveTextContent("Wall panels");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Rate|PMC Margin|AI Suggestions/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Original saved summary" })).not.toBeVisible();
    await user.click(screen.getByText("Saved details & revision history"));
    expect(screen.getByRole("region", { name: "Original saved summary" })).toBeVisible();
  });

  it("labels confirmed counts separately from an unsaved checklist and follows authoritative refreshes", async () => {
    const { client } = setup("quality", true);
    const card = await screen.findByRole("region", { name: "Shared checklist" });
    expect(await within(card).findByText("Version 3")).toBeVisible();
    expect(within(card).getByText("2")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("unsaved checklist changes");
    expect(screen.queryByText("Shared checklist saved.")).not.toBeInTheDocument();
    act(() => client.setQueryData(knowledgeQueryKeys.basketQuality(item.basketId), { ...quality, revisionId: "checklist-4", revisionNumber: 4, parameters: [] }));
    expect(await within(card).findByText("Version 4")).toBeVisible();
    expect(within(card).getByText("0")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("unsaved checklist changes");
    expect(api.getKnowledgeSection).not.toHaveBeenCalled();
  });

  it("does not report missing checklist data as a saved configuration", async () => {
    vi.mocked(api.getKnowledgeBasketQuality).mockRejectedValue(new Error("Temporarily unavailable"));
    const user = userEvent.setup();
    setup("quality");
    const retry = await screen.findByRole("button", { name: "Retry checklist details" });
    expect(screen.getByRole("status")).toHaveTextContent("confirm its saved status");
    expect(screen.queryByText("Shared checklist saved.")).not.toBeInTheDocument();
    vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ ...quality, revisionId: null, revisionNumber: 0, parameters: [] });
    await user.click(retry);
    expect(await screen.findByText("No shared checklist saved yet.")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

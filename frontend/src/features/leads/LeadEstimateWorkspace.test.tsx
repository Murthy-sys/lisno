import { screen, waitFor, within } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateClientReviewSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, retryEstimateClientEmail, type EstimateDraft, type EstimateStatus } from "./leadsApi";
import { clientKeys } from "../client/clientApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";

const response = (data: unknown) => Response.json({ data });

type DeliveryStatus = EstimateClientReviewSummary["deliveryStatus"];

interface EstimateFixture {
  id: string;
  propertyType: string;
  rooms: Array<Record<string, unknown>>;
  scopes: string[];
  lineItems: Array<{
    catalogueId: string;
    roomName: string;
    specification: string;
    unit: string;
    rate: number;
    quantity: number;
    included: boolean;
  }>;
  subtotal: number;
  gst: number;
  total: number;
  status: EstimateStatus;
  approvalRequired: boolean;
  clientReview: EstimateClientReviewSummary | null;
  clientFeedback?: EstimateDraft["clientFeedback"];
}

const deliveryCopy: Record<DeliveryStatus, string> = {
  queued: "Email queued",
  sending: "Email sending",
  sent: "Email sent",
  failed: "Email delivery failed",
  disabled: "Email unavailable"
};

const reviewSummary = (
  deliveryStatus: DeliveryStatus,
  overrides: Partial<EstimateClientReviewSummary> = {}
): EstimateClientReviewSummary => ({
  id: "round-1",
  sendGeneration: 2,
  estimateVersion: 4,
  version: 3,
  deliveryStatus,
  deliveryAttemptCount: deliveryStatus === "disabled" ? 0 : 1,
  deliveredAt: deliveryStatus === "sent" ? "2026-08-24T15:30:00.000Z" : null,
  status: "pending",
  ...overrides
});

const estimateFixture = (
  status: EstimateFixture["status"],
  clientReview: EstimateClientReviewSummary | null = null
): EstimateFixture => ({
  id: "estimate-1",
  propertyType: "2BHK",
  rooms: [
    {
      id: "room-living",
      label: "Living Room",
      icon: "🛋️",
      typeId: "living",
      sqft: 200,
      length: null,
      width: null
    }
  ],
  scopes: ["FC"],
  lineItems: [
    {
      catalogueId: "FC01",
      roomName: "Living Room",
      specification: "Gypsum plain",
      unit: "sqft",
      rate: 95,
      quantity: 200,
      included: true
    }
  ],
  subtotal: 19000,
  gst: 3420,
  total: 22420,
  status,
  approvalRequired: false,
  clientReview
});

const leadFixture = {
  id: "lead-1",
  clientName: "Asha Shah",
  projectName: "Asha home",
  location: "Pune",
  propertyType: "2BHK"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface WorkspaceHarnessOptions {
  initialEstimate: EstimateFixture;
  refetchedEstimate: EstimateFixture;
  publication?: {
    endpoint: "submit" | "send";
    result: EstimateFixture;
    response?: EstimateFixture;
    deferRefetch?: boolean;
  };
  failure?: "save" | "submit";
  refetchFailure?: boolean;
  retry?: {
    result?: EstimateClientReviewSummary;
    conflict?: boolean;
  };
}

function installWorkspaceHarness(options: WorkspaceHarnessOptions) {
  const pendingRefetch = deferred<Response>();
  const requests: Array<{ method: string; url: string; body: BodyInit | null | undefined }> = [];
  const counts = { estimateGets: 0, saves: 0, submits: 0, sends: 0, retries: 0 };

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url, body: init?.body });

    if (url.endsWith("/leads/lead-1/estimate") && method === "GET") {
      counts.estimateGets += 1;
      if (counts.estimateGets === 1) return response(options.initialEstimate);
      if (options.refetchFailure) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed." } }, { status: 503 });
      const published = counts.submits > 0 || counts.sends > 0;
      if (published && options.publication?.deferRefetch) return pendingRefetch.promise;
      return response(published ? options.publication?.result ?? options.refetchedEstimate : options.refetchedEstimate);
    }
    if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
    if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
      counts.saves += 1;
      if (options.failure === "save") return Response.json({ error: { code: "CONFLICT", message: "Save failed." } }, { status: 409 });
      return response(options.initialEstimate);
    }
    if (url.endsWith("/leads/lead-1/estimate/submit") && method === "POST") {
      counts.submits += 1;
      if (options.failure === "submit") return Response.json({ error: { code: "CONFLICT", message: "Submit failed." } }, { status: 409 });
      if (options.publication?.endpoint !== "submit") {
        throw new Error("Unexpected low-value submission");
      }
      return response(options.publication.response ?? options.publication.result);
    }
    if (url.endsWith("/estimates/estimate-1/send-client") && method === "POST") {
      counts.sends += 1;
      if (options.publication?.endpoint !== "send") {
        throw new Error("Unexpected high-value send");
      }
      return response(options.publication.response ?? options.publication.result);
    }
    if (url.endsWith("/estimates/estimate-1/client-email/retry") && method === "POST") {
      counts.retries += 1;
      if (!options.retry) throw new Error("Unexpected email retry");
      if (options.retry.conflict) {
        return Response.json(
          { error: { code: "VERSION_CONFLICT", message: "The delivery state changed." } },
          { status: 409 }
        );
      }
      return response(options.retry.result);
    }
    if (url.includes("/estimate-plan-change-requests?") && method === "GET") return response([]);
    if (url.endsWith("/estimates/estimate-1/design-uploads") && method === "GET") return response({ uploads: [], drawings: [] });
    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  return {
    counts,
    requests,
    releaseRefetch() {
      pendingRefetch.resolve(response(options.publication?.result ?? options.refetchedEstimate));
    }
  };
}

function renderWorkspace(extra?: React.ReactNode) {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
      {extra}
      <Routes>
        <Route
          path="/estimator-sales/leads/:leadId/estimate"
          element={<LeadEstimateWorkspace />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function RefetchSavedEstimate() {
  const queryClient = useQueryClient();
  return <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: leadKeys.estimate("lead-1") })}>Refetch saved estimate</button>;
}

describe("LeadEstimateWorkspace", () => {
  it("omits basket descriptions and count badges while keeping independent card toggles and disclosures with keyboard support", async () => {
    const basketName = "Wall and ceiling finishes with specialist surface preparation";
    const description = "Prepare surfaces and apply the specified finishes.\nProtect adjoining furniture during execution.";
    let failRefresh = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return response(null);
      if (url.includes("/estimation/catalogue?")) {
        if (failRefresh) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed" } }, { status: 503 });
        return response({ items: [
          { id: "basket-finishes", name: basketName, description, displayOrder: 1, subBaskets: [
            { id: "sub-wall", basketId: "basket-finishes", name: "Wall finish", displayOrder: 1, mainLines: [], temporaryItems: [] }
          ], directTemporaryItems: [] },
          { id: "basket-empty", name: "Electrical Works", description: null, displayOrder: 2, subBaskets: [], directTemporaryItems: [] },
          { id: "basket-legacy", name: "Legacy Description", displayOrder: 3, subBaskets: [], directTemporaryItems: [] }
        ], pagination: { limit: 100, offset: 0, total: 3, hasMore: false }, ineligibleLineCount: 0 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("article", { name: basketName });
    expect(within(card).getByRole("heading", { name: basketName })).toBeVisible();
    expect(within(card).queryByText(/Prepare surfaces and apply the specified finishes/)).not.toBeInTheDocument();
    expect(card.querySelector(".configured-estimate-chooser__description")).toBeNull();
    expect(card.querySelector(".configured-estimate-chooser__counts")).toBeNull();
    expect(within(card).queryByText("1 Sub Basket")).not.toBeInTheDocument();
    const add = within(card).getByRole("button", { name: `Add ${basketName}` });
    expect(add).toHaveAttribute("aria-pressed", "false");
    expect(add).toHaveTextContent("Add");
    expect(add).not.toHaveAccessibleDescription();
    expect(add).not.toHaveAttribute("aria-describedby");
    const disclosure = within(card).getByRole("button", { name: `Show ${basketName} details` });
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText("Wall finish")).toBeVisible();
    expect(within(card).getByText("0 Main Lines · 0 Temporary Items")).toBeVisible();
    expect(add).toHaveAttribute("aria-pressed", "false");
    add.focus();
    await user.keyboard(" ");
    const added = within(card).getByRole("button", { name: `Added ${basketName}` });
    expect(added).toHaveFocus();
    expect(added).toHaveAttribute("aria-pressed", "true");
    expect(added).toHaveTextContent("Added");
    expect(card).toHaveClass("configured-estimate-chooser__item--selected");
    await user.keyboard("{Enter}");
    expect(add).toHaveAttribute("aria-pressed", "false");
    expect(card).not.toHaveClass("configured-estimate-chooser__item--selected");
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Electrical Works", "Legacy Description"]) {
      const undescribed = screen.getByRole("article", { name });
      expect(undescribed.querySelector(".configured-estimate-chooser__description")).toBeNull();
      expect(undescribed.querySelector(".configured-estimate-chooser__counts")).toBeNull();
      expect(within(undescribed).getByRole("button", { name: `Add ${name}` })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(add);
    failRefresh = true;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await screen.findByText("The catalogue refresh failed. The last loaded baskets are shown; retry before adding items.");
    expect(within(card).getByRole("button", { name: `Added ${basketName}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Electrical Works" })).toBeDisabled();
    expect(disclosure).toBeEnabled();
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(within(card).getByRole("button", { name: `Added ${basketName}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("blocks editing when the saved estimate read fails", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed." } }, { status: 503 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWorkspace();
    expect(await screen.findByText("We couldn't load the saved estimate. Retry before making changes.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry estimate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(requests.some((url) => url.includes("/estimation/catalogue?"))).toBe(false);
  });

  it("clears rooms and configured line state when the mounted route changes leads", async () => {
    const savedA = {
      id: "estimate-a", version: 2, propertyType: "2BHK", rooms: [{ id: "room-a", label: "Master Bedroom", icon: "", typeId: "master", sqft: 200, length: null, width: null }],
      scopes: [], selectedMainBasketIds: ["basket-a"], status: "draft", approvalRequired: false,
      lineItems: [{ id: "saved-line-a", source: "configuration", catalogueId: "line-a", roomId: "room-a", roomName: "Master Bedroom", mainBasketId: "basket-a", mainBasketName: "Joinery", subBasketId: "sub-a", subBasketName: "Wardrobes", mainLineId: "line-a", mainLineName: "Wardrobe carcass", revisionId: "revision-a", uomId: "uom-a", uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2, unit: "sq ft", specification: null, rate: 80, ratePaise: 8000, amount: 80, amountPaise: 8000, quantity: 1, included: true }],
      subtotal: 80, gst: 14.4, total: 94.4
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-a/estimate")) return response(savedA);
      if (url.endsWith("/leads/lead-b/estimate")) return response(null);
      if (url.endsWith("/leads/lead-a") || url.endsWith("/leads/lead-b")) return response({ ...leadFixture, clientName: url.endsWith("lead-a") ? "Asha Shah" : "Rhea Kapoor" });
      if (url.includes("/estimation/catalogue?")) return response({ items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false }, ineligibleLineCount: 0 });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-a/estimate"]}>
      <Link to="/estimator-sales/leads/lead-b/estimate">Next lead</Link>
      <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
    </MemoryRouter>);
    const unavailableSaved = await screen.findByRole("region", { name: "Saved items unavailable in current Configuration" });
    expect(within(unavailableSaved).getByText("Wardrobe carcass")).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Next lead" }));
    expect(await screen.findByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(screen.queryByText("Wardrobe carcass")).not.toBeInTheDocument();
    expect(screen.queryByText("Master Bedroom")).not.toBeInTheDocument();
  });

  it("refreshes a saved Main Line from Configuration without losing estimate inputs", async () => {
    const storedLine = {
      id: "saved-paint", source: "configuration", catalogueId: "line-paint", roomId: "room-living", roomName: "Living & Dining",
      mainBasketId: "basket-paint", mainBasketName: "Painting", subBasketId: "sub-paint", subBasketName: "Interior",
      mainLineId: "line-paint", mainLineName: "Old painting", revisionId: "revision-one", uomId: "uom-sqft", uomCode: "SQFT",
      uomName: "sq ft", uomDecimalScale: 2, unit: "sq ft", specification: null, rate: 80, ratePaise: 8000,
      quantity: 2, included: true, amount: 160, amountPaise: 16000, classification: "special"
    };
    const stored = {
      id: "estimate-paint", version: 2, propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living & Dining", typeId: "living", icon: "", sqft: 200, length: null, width: null }],
      scopes: [], selectedMainBasketIds: ["basket-paint"], selectedMainBasketClassifications: [{ mainBasketId: "basket-paint", classification: "special" }],
      lineItems: [storedLine], subtotal: 160, gst: 28.8, total: 188.8, status: "draft", approvalRequired: false
    };
    let catalogueVersion = 1;
    let savedReads = 0;
    const saves: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") {
        savedReads += 1;
        return response(catalogueVersion === 1 ? stored : { ...stored, lineItems: [{ ...storedLine,
          mainLineName: "Updated painting", revisionId: "revision-two" }] });
      }
      if (url.includes("/estimation/catalogue?") && method === "GET") return response({
        items: [{ id: "basket-paint", name: "Painting", displayOrder: 1, subBaskets: [{ id: "sub-paint", basketId: "basket-paint", name: "Interior", displayOrder: 1,
          mainLines: [{ id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint", name: catalogueVersion === 1 ? "Old painting" : "Updated painting", displayOrder: 1,
            revisionId: catalogueVersion === 1 ? "revision-one" : "revision-two", inHouseBaseRatePaise: catalogueVersion === 1 ? 7500 : 9500,
            uom: { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 } }] }] }],
        pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0
      });
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        saves.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return response({ ...stored, version: 3 });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace(<RefetchSavedEstimate />);
    expect(await screen.findByRole("checkbox", { name: /Old painting/ })).toBeChecked();
    await user.clear(screen.getByRole("textbox", { name: /Selling rate.*Old painting/ }));
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Old painting/ }), "82");
    catalogueVersion = 2;
    await user.click(screen.getByRole("button", { name: "Refetch saved estimate" }));
    await waitFor(() => expect(savedReads).toBe(2));
    expect(screen.getByRole("textbox", { name: /Selling rate.*Old painting/ })).toHaveValue("82");
    await user.click(screen.getAllByRole("button", { name: "Refresh available items" })[0]!);
    expect(await screen.findByRole("checkbox", { name: /Updated painting/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Updated painting/ })).toHaveValue("82");
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Updated painting/ })).toHaveValue(2);
    expect(screen.getByRole("radio", { name: /Special item type for Painting, Interior, Updated painting/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.lineItems).toEqual(expect.arrayContaining([expect.objectContaining({
      id: "saved-paint", mainLineId: "line-paint", revisionId: "revision-two", quantity: 2,
      classification: "special", ratePaise: 8200
    })]));
    expect(saves[0]!.selectedMainBasketClassifications).toEqual([{ mainBasketId: "basket-paint", classification: "special" }]);
    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Item type:")).not.toBeInTheDocument();
  });

  it("builds a new estimate from configured baskets, keeps blank rates incomplete, and saves exact paise", async () => {
    const catalogue = {
      items: [{ id: "basket-joinery", name: "Joinery", displayOrder: 1, subBaskets: [{
        id: "sub-wardrobes", basketId: "basket-joinery", name: "Wardrobes", displayOrder: 1,
        mainLines: [{ id: "line-carcass", mainLineId: "line-carcass", basketId: "basket-joinery", subBasketId: "sub-wardrobes", name: "Wardrobe carcass", displayOrder: 1, revisionId: "revision-3", uom: { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 } }]
      }] }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0
    };
    const saves: Array<Record<string, unknown>> = [];
    let savedEstimate: Record<string, unknown> | null = null;
    let savedVersion = 0;
    let estimateGets = 0;
    let conflictOnNextSave = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") {
        estimateGets += 1;
        return response(savedEstimate);
      }
      if (url.includes("/estimation/catalogue?") && method === "GET") return response(catalogue);
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        if (conflictOnNextSave) return Response.json({ error: {
          code: "ESTIMATE_VERSION_CONFLICT", message: "This estimate changed. Refresh it before saving again."
        } }, { status: 409 });
        savedVersion += 1;
        const line = (payload.lineItems as Array<Record<string, unknown>>)[0]!;
        const ratePaise = line.ratePaise as number | null;
        const amountPaise = ratePaise === null ? null : Math.round(ratePaise * (line.quantity as number));
        const subtotalPaise = amountPaise ?? 0;
        savedEstimate = {
          id: "estimate-configured", version: savedVersion, ...payload,
          lineItems: [{ ...line, id: "estimate-line-stable", mainBasketName: "Joinery", subBasketName: "Wardrobes", mainLineName: "Wardrobe carcass", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2, unit: "sq ft", specification: null, rate: ratePaise === null ? null : ratePaise / 100, amount: amountPaise === null ? null : amountPaise / 100, amountPaise }],
          subtotalPaise, gstPaise: Math.round(subtotalPaise * .18), totalPaise: subtotalPaise + Math.round(subtotalPaise * .18),
          subtotal: subtotalPaise / 100, gst: Math.round(subtotalPaise * .18) / 100, total: (subtotalPaise + Math.round(subtotalPaise * .18)) / 100,
          status: "draft", approvalRequired: false
        };
        return response(savedEstimate);
      }
      if (url.endsWith("/leads/lead-1/estimate/submit") && method === "POST") {
        return Response.json({ error: { code: "ESTIMATE_LOCKED", message: "Submission failed." } }, { status: 409 });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Main Baskets" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) Joinery$/ }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));

    expect(screen.getByRole("region", { name: "Joinery" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Wardrobes" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Wardrobe carcass/ })).toHaveAccessibleName(/sq ft/);
    expect(screen.queryByText("False ceiling")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Wardrobe carcass/ }));
    await user.click(screen.getByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ }));
    expect(screen.getByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Wardrobe carcass/ }));
    expect(screen.queryByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Wardrobe carcass/ }));
    expect(screen.getByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ })).toBeChecked();
    expect(screen.getByText("Rate required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect((saves[0]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({
      source: "configuration", catalogueId: "line-carcass", mainBasketId: "basket-joinery",
      subBasketId: "sub-wardrobes", mainLineId: "line-carcass", revisionId: "revision-3",
      uomId: "uom-sqft", ratePaise: null, quantity: 1, included: true, classification: "special"
    });
    expect(saves[0]!.selectedMainBasketIds).toEqual(["basket-joinery"]);
    expect(saves[0]!.selectedMainBasketClassifications).toEqual([{ mainBasketId: "basket-joinery", classification: "standard" }]);
    expect(await screen.findByText("Estimate draft saved.")).toBeVisible();
    expect(estimateGets).toBe(1);

    const quantity = await screen.findByRole("spinbutton", { name: /Quantity.*Wardrobe carcass/ });
    await user.clear(quantity);
    await user.type(quantity, "1.25");
    const rate = screen.getByRole("textbox", { name: /Selling rate.*Wardrobe carcass/ });
    await user.type(rate, "80.05");
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "estimate-line-stable", quantity: 1.25, ratePaise: 8005
    });
    expect(saves[1]!.expectedVersion).toBe(1);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    conflictOnNextSave = true;
    await user.clear(rate);
    await user.type(rate, "90");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("This estimate changed elsewhere. Reload the latest saved estimate before editing it again.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Wardrobe carcass/ })).toHaveValue("90");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Selling rate.*Wardrobe carcass/ })).toHaveValue("80.05"));
    expect(screen.getByRole("radio", { name: /Special item type for Joinery, Wardrobes, Wardrobe carcass in Living & Dining/ })).toBeChecked();
    expect(estimateGets).toBe(2);

    conflictOnNextSave = false;
    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    expect(await screen.findByText("The estimate action could not be completed. Check the current workflow state and try again.")).toBeVisible();
    expect(saves[3]!.expectedVersion).toBe(2);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(5));
    expect(saves[4]!.expectedVersion).toBe(3);
    await waitFor(() => expect(screen.queryByText("The estimate action could not be completed. Check the current workflow state and try again.")).not.toBeInTheDocument());
  });

  it("starts a new configured estimate line at its Sub-Vendor base rate", async () => {
    const catalogue = { items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1,
      subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
        mainLines: [{ id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na",
          name: "POP false ceiling", displayOrder: 1, revisionId: "revision-pop", inHouseBaseRatePaise: 115_000,
          modeBaseRatesPaise: { pmc: 95_000, sub_vendor: 105_000, in_house: 115_000 },
          uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }] }] }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 };
    let savedInput: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(null);
      if (url.includes("/estimation/catalogue?") && method === "GET") return response(catalogue);
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        savedInput = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const submittedLine = (savedInput.lineItems as Array<Record<string, unknown>>)[0]!;
        return response({ ...savedInput, lineItems: [{ ...submittedLine, id: "saved-pop",
          mainBasketName: "POP / Gypsum", subBasketName: "NA", mainLineName: "POP false ceiling",
          uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2, unit: "sq ft",
          rate: 1050, amount: 1050, amountPaise: 105_000 }],
          id: "estimate-pop", version: 1, status: "draft",
          approvalRequired: false, subtotal: 1050, gst: 189, total: 1239 });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Main Baskets" });
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    const rate = screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    expect(rate).toHaveValue("1050");
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInput).not.toBeNull());
    expect((savedInput!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({
      mainLineId: "line-pop", ratePaise: 105_000, quantity: 1, included: true, pricingMode: "sub_vendor", rateSource: "configuration"
    });
  });

  it("shows modes only after inclusion and preserves choices across hiding, basket reselection and save/reload", async () => {
    const user = userEvent.setup();
    const catalogue = { items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1,
      subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
        mainLines: [
          { id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na", name: "POP false ceiling",
            displayOrder: 1, revisionId: "revision-pop", itemVersion: 1, revisionVersion: 1,
            modeBaseRatesPaise: { pmc: 12000, sub_vendor: 15000, in_house: 18000 },
            uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } },
          { id: "line-cove", mainLineId: "line-cove", basketId: "basket-pop", subBasketId: "sub-na", name: "Cove in Gypsum",
            displayOrder: 2, revisionId: "revision-cove", itemVersion: 1, revisionVersion: 1,
            modeBaseRatesPaise: { pmc: 5050, sub_vendor: 7550, in_house: 10550 },
            uom: { id: "uom-rft", code: "RFT", name: "Rft", decimalScale: 1 } }
        ] }] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 };
    let savedEstimate: Record<string, unknown> | null = null;
    const saves: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(savedEstimate);
      if (url.includes("/estimation/catalogue?")) return response(catalogue);
      if (url.includes("/estimation/catalogue/recommendations?")) return response({ sources: [] });
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        savedEstimate = { ...payload, id: "estimate-preview", version: saves.length, status: "draft", approvalRequired: false,
          subtotal: 297.19, gst: 53.49, total: 350.68,
          lineItems: (payload.lineItems as Array<Record<string, unknown>>).map((line) => {
            const source = catalogue.items[0]!.subBaskets[0]!.mainLines.find((entry) => entry.mainLineId === line.mainLineId)!;
            const amountPaise = line.included ? Math.round(Number(line.ratePaise) * Number(line.quantity)) : 0;
            return { ...line, id: `saved-${line.roomId}-${line.mainLineId}`, mainBasketName: "POP / Gypsum", subBasketName: "NA",
              mainLineName: source.name, sourceItemVersion: 1, sourceRevisionVersion: 1, uomCode: source.uom.code,
              uomName: source.uom.name, uomDecimalScale: source.uom.decimalScale, unit: source.uom.name, specification: null,
              rate: Number(line.ratePaise) / 100, amountPaise, amount: amountPaise / 100 };
          }) };
        return response(savedEstimate);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const view = renderWorkspace();
    await screen.findByRole("heading", { name: "Main Baskets" });
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("option", { name: "Master Bedroom" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    const row = () => screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const cove = () => screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    expect(within(row()).getByRole("checkbox")).not.toBeChecked();
    expect(within(cove()).getByRole("checkbox")).not.toBeChecked();
    expect(within(row()).queryByRole("group", { name: /Item type/ })).not.toBeInTheDocument();
    expect(within(cove()).queryByRole("group", { name: /Item type/ })).not.toBeInTheDocument();
    await user.click(within(row()).getByRole("checkbox"));
    await user.click(within(row()).getByRole("radio", { name: /Special item type/ }));
    await user.click(within(row()).getByRole("radio", { name: /PMC pricing mode/ }));
    const rate = within(row()).getByRole("textbox", { name: /Selling rate/ });
    expect(rate).toHaveValue("120");
    await user.clear(rate);
    await user.type(rate, "177.35");
    await user.clear(within(row()).getByRole("spinbutton", { name: /Quantity/ }));
    await user.type(within(row()).getByRole("spinbutton", { name: /Quantity/ }), "1.25");
    await user.click(within(row()).getByRole("checkbox"));
    expect(within(row()).queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    expect(within(row()).queryByText(/Base price/)).not.toBeInTheDocument();
    expect(screen.getByText("₹0 total")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(within(row()).queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    await user.click(within(row()).getByRole("checkbox"));
    expect(within(row()).getByRole("radio", { name: /Special item type/ })).toBeChecked();
    expect(within(row()).getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked();
    expect(within(row()).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("177.35");
    expect(within(cove()).queryByRole("group", { name: /Item type/ })).not.toBeInTheDocument();
    await user.click(within(row()).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Master Bedroom.*₹0/ }));
    expect(within(row()).queryByRole("group", { name: /Item type/ })).not.toBeInTheDocument();
    expect(within(row()).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("150");
    await user.click(screen.getByRole("button", { name: /Living & Dining.*₹0/ }));
    await user.click(within(row()).getByRole("checkbox"));
    await user.click(within(cove()).getByRole("checkbox"));
    expect(screen.getByText("₹350.68 total")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(saves[0]!.lineItems).toHaveLength(2);
    expect(saves[0]!.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ mainLineId: "line-pop", classification: "special", pricingMode: "pmc", rateSource: "manual", ratePaise: 17735, quantity: 1.25, included: true }),
      expect.objectContaining({ mainLineId: "line-cove", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", ratePaise: 7550, included: true })
    ]));
    view.unmount();
    renderWorkspace();
    await screen.findByText("POP false ceiling");
    await waitFor(() => expect(within(row()).getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked());
    expect(within(row()).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("177.35");
    await user.click(within(row()).getByRole("checkbox"));
    expect(within(row()).queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(saves[1]!.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ mainLineId: "line-pop", classification: "special", pricingMode: "pmc", rateSource: "manual", ratePaise: 17735, included: false })
    ]));
  });

  it.each(["new", "saved"])("freezes a %s configured line through submission and hydrates the authoritative published snapshot", async (kind) => {
    const user = userEvent.setup();
    const saveGate = deferred<void>();
    const publishGate = deferred<void>();
    let catalogueVersion = 1;
    let catalogueReads = 0;
    let posts = 0;
    let submittedInput: Record<string, unknown> | undefined;
    const line = {
      id: "saved-pop", source: "configuration", itemType: "main_line", classification: "special", pricingMode: "pmc", rateSource: "configuration",
      catalogueId: "line-pop", mainLineId: "line-pop", roomId: "room-living", roomName: "Living & Dining",
      mainBasketId: "basket-pop", mainBasketName: "POP / Gypsum", subBasketId: "sub-na", subBasketName: "NA",
      mainLineName: "POP false ceiling", revisionId: "revision-pop-1", sourceItemVersion: 1, sourceRevisionVersion: 1,
      uomId: "uom-sq", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2, unit: "sq ft", specification: null,
      quantity: 1, ratePaise: 12025, rate: 120.25, amountPaise: 12025, amount: 120.25, included: true
    };
    let estimate: Record<string, unknown> = {
      id: "estimate-publishing", version: 1, status: "draft", approvalRequired: false, propertyType: "2BHK",
      rooms: [{ id: "room-living", label: "Living & Dining", typeId: "living", sqft: 300 }],
      scopes: [], selectedMainBasketIds: ["basket-pop"], lineItems: kind === "saved" ? [line] : [],
      subtotalPaise: 12025, gstPaise: 2165, totalPaise: 14190, subtotal: 120.25, gst: 21.65, total: 141.9
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(estimate);
      if (url.includes("/estimation/catalogue?")) {
        catalogueReads += 1;
        return response({ items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1,
          subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1, mainLines: [{
            id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na", name: "POP false ceiling",
            displayOrder: 1, revisionId: `revision-pop-${catalogueVersion}`, itemVersion: catalogueVersion, revisionVersion: catalogueVersion,
            modeBaseRatesPaise: { pmc: catalogueVersion === 1 ? 12025 : 22025, sub_vendor: 16000, in_house: 19050 },
            uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 }
          }] }] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.includes("/estimation/catalogue/recommendations?")) return response({ sources: [] });
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        submittedInput = JSON.parse(String(init?.body)) as Record<string, unknown>;
        await saveGate.promise;
        estimate = { ...estimate, ...submittedInput, version: 2, lineItems: [line] };
        return response(estimate);
      }
      if (url.endsWith("/leads/lead-1/estimate/submit") && method === "POST") {
        posts += 1;
        await publishGate.promise;
        estimate = { ...estimate, status: "sent_to_client", version: 3,
          lineItems: [{ ...line, mainLineName: "Published POP false ceiling" }], clientReview: reviewSummary("disabled") };
        return response(estimate);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    renderWorkspace();
    if (kind === "new") {
      await user.click(await screen.findByRole("button", { name: "Continue to item selection" }));
      await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
      await user.click(screen.getByRole("radio", { name: /Special item type/ }));
      await user.click(screen.getByRole("radio", { name: /PMC pricing mode/ }));
    }
    await waitFor(() => expect(screen.getByText("Base price: ₹120.25 / sq ft")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    await waitFor(() => expect(submittedInput).toBeDefined());
    expect(screen.queryByRole("radio", { name: /In-house pricing mode/ })).not.toBeInTheDocument();
    const price = screen.getByRole("textbox", { name: /Selling rate/ });
    expect(price).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: /Quantity/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to Asha Shah" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    await user.type(price, "900");
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(price).toHaveValue("120.25");
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    catalogueVersion = 2;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(catalogueReads).toBe(2));
    expect(price).toHaveValue("120.25");
    expect(screen.getByText("₹141.9 total")).toBeVisible();
    saveGate.resolve();
    await waitFor(() => expect(posts).toBe(1));
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("120.25");
    expect(screen.queryByRole("radio", { name: /pricing mode/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByText("₹141.9 total")).toBeVisible();
    publishGate.resolve();
    await screen.findByText(/Submitted to the client portal/);
    expect(screen.getByRole("heading", { name: "Estimate summary" })).toBeVisible();
    expect(screen.getByText("₹141.9 total")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    expect(screen.getByText("Published POP false ceiling")).toBeVisible();
    expect(screen.getByText("PMC")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Selling rate/ })).toHaveValue("120.25");
    expect(screen.queryByRole("radio", { name: /pricing mode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
    expect((submittedInput!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ pricingMode: "pmc", rateSource: "configuration", ratePaise: 12025, revisionId: "revision-pop-1" });
  });

  it("preserves newer mode choices and refreshed prices during a pending save, then saves and restores both rooms", async () => {
    const user = userEvent.setup();
    let version = 1;
    let failRefresh = false;
    const pendingSave = deferred<void>();
    const rooms = [
      { id: "room-living", label: "Living & Dining", typeId: "living", sqft: 300 },
      { id: "room-bedroom", label: "Master Bedroom", typeId: "master", sqft: 150 }
    ];
    const configuredLine = {
      source: "configuration", itemType: "main_line", catalogueId: "line-pop", mainLineId: "line-pop",
      mainBasketId: "basket-pop", mainBasketName: "POP / Gypsum", subBasketId: "sub-na", subBasketName: "NA",
      mainLineName: "POP false ceiling", revisionId: "revision-pop-1", sourceItemVersion: 1, sourceRevisionVersion: 1,
      uomId: "uom-sq", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2, unit: "sq ft", specification: null,
      classification: "special", included: true
    };
    let savedEstimate: Record<string, unknown> = {
      id: "estimate-pricing", version: 1, status: "draft", approvalRequired: false, propertyType: "2BHK", rooms,
      selectedMainBasketIds: ["basket-pop"], scopes: [], subtotal: 493.97, gst: 88.91, total: 582.88,
      lineItems: rooms.map((room, index) => ({ ...configuredLine, id: `saved-${room.id}`, roomId: room.id,
        roomName: room.label, quantity: index ? 2 : 1.25, pricingMode: index ? "in_house" : "pmc",
        rateSource: index ? "manual" : "configuration", ratePaise: index ? 17183 : 12025,
        rate: index ? 171.83 : 120.25, amountPaise: index ? 34366 : 15031, amount: index ? 343.66 : 150.31 }))
    };
    const saves: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(savedEstimate);
      if (url.includes("/estimation/catalogue?") && method === "GET") {
        if (failRefresh) return Response.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 });
        return response({ items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1,
          subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
            mainLines: [{ id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na",
              name: "POP false ceiling", displayOrder: 1, revisionId: `revision-pop-${version}`, itemVersion: version,
              revisionVersion: version, modeBaseRatesPaise: { pmc: 12025, sub_vendor: version === 1 ? 12540 : 22540, in_house: version === 1 ? 18050 : 28050 },
              uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }] }] }],
          pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.includes("/estimation/catalogue/recommendations?")) return response({ sources: [] });
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        const submittedVersion = version;
        if (saves.length === 1) await pendingSave.promise;
        savedEstimate = { ...savedEstimate, ...payload, version: saves.length + 1,
          lineItems: (payload.lineItems as Array<Record<string, unknown>>).map((line) => ({
            ...configuredLine, ...line, id: `saved-${line.roomId}`, sourceItemVersion: submittedVersion,
            sourceRevisionVersion: submittedVersion, rate: Number(line.ratePaise) / 100,
            amountPaise: Math.round(Number(line.ratePaise) * Number(line.quantity)),
            amount: Math.round(Number(line.ratePaise) * Number(line.quantity)) / 100
          })) };
        return response(savedEstimate);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const view = renderWorkspace();
    await screen.findByRole("textbox", { name: /Selling rate.*Living & Dining/ });
    await waitFor(() => expect(screen.getByText("Base price: ₹120.25 / sq ft")).toBeVisible());
    const rate = screen.getByRole("textbox", { name: /Selling rate.*Living & Dining/ });
    expect(rate).toHaveValue("120.25");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect((saves[0]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ pricingMode: "pmc", rateSource: "configuration", itemVersion: 1, revisionVersion: 1 });
    await user.click(screen.getByRole("radio", { name: /In-house pricing mode.*Living & Dining/ }));
    expect(rate).toHaveValue("180.5");
    await user.click(screen.getByRole("radio", { name: /Standard item type.*Living & Dining/ }));
    expect(rate).toHaveValue("125.4");
    version = 2;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(rate).toHaveValue("225.4"));
    pendingSave.resolve();
    await screen.findByText("Estimate draft saved.");
    expect(screen.getByRole("radio", { name: /Standard item type.*Living & Dining/ })).toBeChecked();
    expect(rate).toHaveValue("225.4");
    await user.click(screen.getByRole("button", { name: /Master Bedroom.*2 sq|Master Bedroom.*₹343.66/ }));
    const manualRate = screen.getByRole("textbox", { name: /Selling rate.*Master Bedroom/ });
    expect(manualRate).toHaveValue("171.83");
    expect(screen.getByRole("radio", { name: /In-house pricing mode.*Master Bedroom/ })).toBeChecked();
    expect(screen.getByText("Base price: ₹280.5 / sq ft")).toBeVisible();
    failRefresh = true;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await screen.findByText("Available items could not be refreshed. The last loaded catalogue is shown. Try again.");
    expect(manualRate).toHaveValue("171.83");
    failRefresh = false;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(screen.queryByText("Available items could not be refreshed. The last loaded catalogue is shown. Try again.")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    const persisted = saves[1]!.lineItems as Array<Record<string, unknown>>;
    expect(persisted[0]).toMatchObject({ classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", ratePaise: 22540,
      revisionId: "revision-pop-2", itemVersion: 2, revisionVersion: 2 });
    expect(persisted[1]).toMatchObject({ classification: "special", pricingMode: "in_house", rateSource: "manual", ratePaise: 17183, revisionId: "revision-pop-2" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByText("₹737.98 total")).toBeVisible();
    expect(screen.getByText("₹281.75")).toBeVisible();
    expect(screen.getByText("₹343.66")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Proposal" }));
    expect(screen.getByText("₹737.98 total")).toBeVisible();
    expect(screen.getByText(/₹225.4 per sq ft/)).toBeVisible();
    expect(screen.getByText(/₹171.83 per sq ft/)).toBeVisible();
    view.unmount();
    renderWorkspace();
    expect(await screen.findByRole("textbox", { name: /Selling rate.*Living & Dining/ })).toHaveValue("225.4");
    expect(screen.getByRole("radio", { name: /Standard item type.*Living & Dining/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /Master Bedroom.*₹343.66/ }));
    expect(screen.getByRole("textbox", { name: /Selling rate.*Master Bedroom/ })).toHaveValue("171.83");
    expect(screen.getByRole("radio", { name: /In-house pricing mode.*Master Bedroom/ })).toBeChecked();
  });

  it("previews quantity times unit price while only checked items affect totals and the saved draft", async () => {
    const catalogue = { readyNonActiveSupported: true, ineligibleLineCount: 0,
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
      items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [],
        subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1,
          mainLines: [{ id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-na",
            name: "POP false ceiling", displayOrder: 1, revisionId: "revision-pop", itemType: "main_line",
            uom: { id: "uom-sq", code: "SQFT", name: "sq ft", decimalScale: 2 } }],
          temporaryItems: [{ id: "line-cove", mainLineId: "line-cove", basketId: "basket-pop", subBasketId: "sub-na",
            name: "Cove in Gypsum", displayOrder: 2, revisionId: "revision-cove", itemType: "temporary",
            uom: { id: "uom-rft", code: "RFT", name: "Rft", decimalScale: 1 } }]
        }] }]
    };
    const savedInputs: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(null);
      if (url.includes("/estimation/catalogue?") && method === "GET") return response(catalogue);
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        savedInputs.push(payload);
        return response({ ...payload, id: "estimate-preview", version: 1, status: "draft", approvalRequired: false,
          subtotal: 38.25, gst: 6.89, total: 45.14, subtotalPaise: 3825, gstPaise: 689, totalPaise: 4514,
          lineItems: (payload.lineItems as Array<Record<string, unknown>>).map((line) => ({ ...line,
            id: "saved-cove", mainBasketName: "POP / Gypsum", subBasketName: "NA", mainLineName: "Cove in Gypsum",
            uomCode: "RFT", uomName: "Rft", uomDecimalScale: 1, unit: "Rft", specification: null,
            rate: 25.5, amount: 38.25, amountPaise: 3825 })) });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("heading", { name: "Main Baskets" });
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("option", { name: "Master Bedroom" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));

    let popRow = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const popQuantity = within(popRow).getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ });
    let popRate = within(popRow).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    await user.clear(popQuantity);
    await user.type(popQuantity, "100");
    await user.type(popRate, "60");
    expect(within(popRow).getByRole("status", { name: /amount for/i })).toHaveTextContent("₹6,000");
    expect(within(popRow).getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹0/ })).toBeVisible();
    expect(screen.getByText("₹0 total")).toBeVisible();

    await user.click(within(popRow).getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹6,000/ })).toBeVisible();
    expect(screen.getByText("₹7,080 total")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    await user.clear(popRate);
    await user.type(popRate, "1000000000000");
    expect(within(popRow).getByRole("status", { name: /amount for/i })).toHaveTextContent("Too large");
    expect(within(popRow).getByText("Amount too large for this quantity and price.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal Incomplete/ })).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining.*Incomplete/ })).toBeVisible();
    expect(screen.getByText("Total incomplete")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    const overflowSummary = screen.getByRole("heading", { name: "Estimate summary" }).closest("section") as HTMLElement;
    expect(within(overflowSummary).getByText("Sub-total").closest("span")).toHaveTextContent("Incomplete");
    expect(within(overflowSummary).getByText("GST @ 18%").closest("span")).toHaveTextContent("Incomplete");
    expect(within(overflowSummary).getByText("Total (incl. GST)").closest("span")).toHaveTextContent("Incomplete");
    expect(within(overflowSummary).getByText(/Total incomplete: correct the quantity or price/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    popRow = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    popRate = within(popRow).getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    await user.clear(popRate);
    await user.type(popRate, "60");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    await user.click(within(popRow).getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(within(popRow).getByRole("status", { name: /amount for/i })).toHaveTextContent("₹6,000");
    expect(screen.getByText("₹0 total")).toBeVisible();

    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Master Bedroom/ }));
    const coveRow = screen.getByText("Cove in Gypsum").closest(".configured-estimate-line") as HTMLElement;
    const coveQuantity = within(coveRow).getByRole("spinbutton", { name: /Quantity.*Cove in Gypsum/ });
    const coveRate = within(coveRow).getByRole("textbox", { name: /Selling rate.*Cove in Gypsum/ });
    await user.clear(coveQuantity);
    await user.type(coveQuantity, "1.5");
    await user.type(coveRate, "25.50");
    expect(within(coveRow).getByRole("status", { name: /amount for/i })).toHaveTextContent("₹38.25");
    expect(screen.getByText("₹0 total")).toBeVisible();
    await user.click(within(coveRow).getByRole("checkbox", { name: /Cove in Gypsum/ }));
    expect(screen.getByRole("button", { name: /Collapse POP \/ Gypsum, subtotal ₹38.25/ })).toBeVisible();
    expect(screen.getByText("₹45.14 total")).toBeVisible();
    const roomNavigation = screen.getByRole("navigation", { name: "Rooms" });
    expect(within(roomNavigation).getByRole("button", { name: /Living & Dining.*₹0/ })).toBeVisible();
    expect(within(roomNavigation).getByRole("button", { name: /Master Bedroom.*₹38.25/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    const summary = screen.getByRole("heading", { name: "Estimate summary" }).closest("section") as HTMLElement;
    expect(within(summary).getByText("Sub-total").closest("span")).toHaveTextContent("₹38.25");
    expect(within(summary).getByText("GST @ 18%").closest("span")).toHaveTextContent("₹6.89");
    expect(within(summary).getByText("Total (incl. GST)").closest("span")).toHaveTextContent("₹45.14");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(1));
    expect(savedInputs[0]!.lineItems).toEqual([expect.objectContaining({
      source: "configuration", itemType: "temporary", roomName: "Master Bedroom", mainLineId: "line-cove",
      uomId: "uom-rft", quantity: 1.5, ratePaise: 2550, included: true
    })]);
  });

  it("selects empty baskets and saves direct and grouped temporary items with real parent IDs", async () => {
    const catalogue = {
      items: [
        { id: "basket-empty", name: "General Items", displayOrder: 1, subBaskets: [{ id: "sub-empty", basketId: "basket-empty", name: "Miscellaneous", displayOrder: 1, mainLines: [], temporaryItems: [] }], directTemporaryItems: [] },
        { id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [
          { id: "temporary-direct", mainLineId: "temporary-direct", itemType: "temporary", basketId: "basket-paint", subBasketId: null, name: "Site protection", displayOrder: 1, revisionId: "revision-direct", itemStatus: "draft", revisionStatus: "draft", itemVersion: 9, revisionVersion: 4, uom: { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 } }
        ], subBaskets: [{
          id: "sub-paint", basketId: "basket-paint", name: "Decorative paints", displayOrder: 1, mainLines: [], temporaryItems: [
            { id: "temporary-grouped", mainLineId: "temporary-grouped", itemType: "temporary", basketId: "basket-paint", subBasketId: "sub-paint", name: "Finish sample", displayOrder: 1, revisionId: "revision-grouped", itemStatus: "inactive", revisionStatus: "active", itemVersion: 11, revisionVersion: 8, uom: { id: "uom-each", code: "NOS", name: "each", decimalScale: 0 } }
          ]
        }] }
      ], pagination: { limit: 100, offset: 0, total: 2, hasMore: false }, ineligibleLineCount: 0
    };
    const saves: Array<Record<string, unknown>> = [];
    let savedEstimate: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(savedEstimate);
      if (url.includes("/estimation/catalogue?") && method === "GET") return response(catalogue);
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        const lineItems = (payload.lineItems as Array<Record<string, unknown>>).map((line, index) => {
          const amountPaise = !line.included ? 0 : line.ratePaise === null ? null : Math.round(Number(line.ratePaise) * Number(line.quantity));
          return { ...line, id: `saved-${index}`, mainBasketName: "Painting", subBasketName: line.subBasketId === null ? null : "Decorative paints", mainLineName: line.mainLineId === "temporary-direct" ? "Site protection" : "Finish sample", sourceItemStatus: line.mainLineId === "temporary-direct" ? "draft" : "inactive", sourceRevisionStatus: line.mainLineId === "temporary-direct" ? "draft" : "active", sourceItemVersion: line.mainLineId === "temporary-direct" ? 9 : 11, sourceRevisionVersion: line.mainLineId === "temporary-direct" ? 4 : 8, uomCode: line.mainLineId === "temporary-direct" ? "SQFT" : "NOS", uomName: line.mainLineId === "temporary-direct" ? "sq ft" : "each", uomDecimalScale: line.mainLineId === "temporary-direct" ? 2 : 0, unit: line.mainLineId === "temporary-direct" ? "sq ft" : "each", specification: null, rate: line.ratePaise === null ? null : Number(line.ratePaise) / 100, amount: amountPaise === null ? null : amountPaise / 100, amountPaise };
        });
        const subtotalPaise = lineItems.reduce((sum, line) => sum + (line.amountPaise ?? 0), 0);
        savedEstimate = { ...payload, id: "estimate-temporary", version: saves.length, lineItems, subtotalPaise, gstPaise: Math.round(subtotalPaise * .18), totalPaise: subtotalPaise + Math.round(subtotalPaise * .18), subtotal: subtotalPaise / 100, gst: Math.round(subtotalPaise * .18) / 100, total: (subtotalPaise + Math.round(subtotalPaise * .18)) / 100, status: "draft", approvalRequired: false };
        return response(savedEstimate);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    const view = renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Project details" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Property type" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Rooms" })).toBeVisible();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) General Items$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^(?:Add|Added) General Items$/ })).not.toHaveAccessibleDescription();
    expect(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ })).not.toHaveAccessibleDescription();
    const paintDetails = screen.getByRole("button", { name: "Show Painting details" });
    await user.click(paintDetails);
    expect(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Directly under Main Basket")).toBeVisible();
    expect(screen.getByText("Decorative paints")).toBeVisible();
    expect(paintDetails).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("region", { name: /Living & Dining dimensions/ })).toBeVisible();
    screen.getByRole("button", { name: /^(?:Add|Added) General Items$/ }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /^(?:Add|Added) General Items$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("region", { name: "Miscellaneous" })).toBeVisible();
    expect(screen.getByText("No available items in this Sub Basket.")).toBeVisible();
    expect(screen.getByText(/No available items in this Main Basket/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.selectedMainBasketIds).toEqual(["basket-empty"]);
    expect(saves[0]!.selectedMainBasketClassifications).toEqual([{ mainBasketId: "basket-empty", classification: "standard" }]);
    expect(saves[0]!.lineItems).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.getByRole("button", { name: /^(?:Add|Added) General Items$/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ }));
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("region", { name: "Direct items in Painting" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Decorative paints" })).toBeVisible();
    expect(screen.queryByText(/Temporary item ·/)).not.toBeInTheDocument();
    expect(screen.getByText(/Draft source$/)).toBeVisible();
    expect(screen.getByText(/Inactive source$/)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /Site protection/ }));
    await user.click(screen.getByRole("checkbox", { name: /Finish sample/ }));
    expect(screen.getByRole("radio", { name: /Standard item type for Painting, Site protection in Living & Dining/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Special item type for Painting, Site protection in Living & Dining/ }));
    expect(screen.getByRole("radio", { name: /Standard item type for Painting, Decorative paints, Finish sample in Living & Dining/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Site protection/ }), "80.05");
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Finish sample/ }), "11");
    await user.clear(screen.getByRole("spinbutton", { name: /Quantity.*Site protection/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Quantity.*Site protection/ }), "1.25");
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]!.selectedMainBasketIds).toEqual(["basket-empty", "basket-paint"]);
    expect(saves[1]!.selectedMainBasketClassifications).toEqual([
      { mainBasketId: "basket-empty", classification: "standard" },
      { mainBasketId: "basket-paint", classification: "standard" }
    ]);
    expect(saves[1]!.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "configuration", itemType: "temporary", classification: "special", mainLineId: "temporary-direct", subBasketId: null, revisionId: "revision-direct", itemVersion: 9, revisionVersion: 4, uomId: "uom-sqft", ratePaise: 8005, quantity: 1.25 }),
      expect.objectContaining({ source: "configuration", itemType: "temporary", classification: "standard", mainLineId: "temporary-grouped", subBasketId: "sub-paint", revisionId: "revision-grouped", itemVersion: 11, revisionVersion: 8, uomId: "uom-each", ratePaise: 1100, quantity: 1 })
    ]));
    expect(await screen.findByText(/^Draft source$/)).toBeVisible();
    expect(screen.getByText(/^Inactive source$/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Proposal" }));
    expect(screen.getByText(/Painting · Temporary item · 1.25 sq ft/)).toBeVisible();
    expect(screen.getByText(/Painting \/ Decorative paints · Temporary item/)).toBeVisible();

    view.unmount();
    renderWorkspace();
    expect(await screen.findByRole("checkbox", { name: /Site protection/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Finish sample/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Site protection/ })).toHaveValue("80.05");
    expect(screen.getByRole("textbox", { name: /Selling rate.*Finish sample/ })).toHaveValue("11");
    expect(screen.getByRole("radio", { name: /Special item type for Painting, Site protection in Living & Dining/ })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^(?:Add|Added) General Items$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("radio", { name: /item type for Main Basket/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Item type:")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    const unselected = screen.getByRole("region", { name: "Saved items from unselected Main Baskets" });
    expect(within(unselected).getByText("Recheck the Main Basket to edit or include these items.")).toBeVisible();
    expect(within(unselected).getByRole("checkbox", { name: /Site protection/ })).not.toBeChecked();
    expect(within(unselected).getByRole("checkbox", { name: /Site protection/ })).toBeDisabled();
    expect(within(unselected).getByRole("checkbox", { name: /Finish sample/ })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Saved items unavailable in current Configuration" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(3));
    expect(saves[2]!.selectedMainBasketIds).toEqual(["basket-empty"]);
    expect(saves[2]!.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "saved-0", itemType: "temporary", classification: "special", subBasketId: null, included: false, ratePaise: 8005 }),
      expect.objectContaining({ id: "saved-1", itemType: "temporary", classification: "standard", subBasketId: "sub-paint", included: false, ratePaise: 1100 })
    ]));
    expect((saves[2]!.lineItems as Array<Record<string, unknown>>).every((line) => !("itemVersion" in line) && !("revisionVersion" in line))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("checkbox", { name: /Site protection/ })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Site protection/ })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Site protection/ })).toHaveValue("80.05");
    await user.click(screen.getByRole("checkbox", { name: /Site protection/ }));
    expect(screen.getByRole("radio", { name: /Special item type for Painting, Site protection in Living & Dining/ })).toBeChecked();
  });

  it("distinguishes a denied catalogue from a failed request that can be retried", async () => {
    let catalogueReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return response(null);
      if (url.includes("/estimation/catalogue?")) {
        catalogueReads += 1;
        return catalogueReads === 1
          ? Response.json({ error: { code: "UNAVAILABLE", message: "Read failed" } }, { status: 503 })
          : response({ items: [{ id: "basket-empty", name: "General Items", displayOrder: 1, subBaskets: [] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent("Configured baskets could not be loaded");
    expect(screen.queryByRole("button", { name: /^(?:Add|Added) General Items$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry catalogue" }));
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) General Items$/ })).toBeEnabled();
    expect(catalogueReads).toBe(2);
  });

  it("keeps configured basket selection read-only in a locked estimate", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return response({ ...estimateFixture("sent_to_client"), lineItems: [], selectedMainBasketIds: ["basket-1"], selectedMainBasketClassifications: [{ mainBasketId: "basket-1", classification: "special" }] });
      if (url.includes("/estimation/catalogue?")) return response({ items: [{ id: "basket-1", name: "Painting", displayOrder: 1, subBaskets: [] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) Painting$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ })).toBeDisabled();
    expect(screen.queryByText("Item type:")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /item type for Main Basket Painting/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
  });

  it("shows denied catalogue access without an empty-basket message or retry control", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return response(null);
      if (url.includes("/estimation/catalogue?")) return Response.json({ error: { code: "FORBIDDEN", message: "Denied" } }, { status: 403 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to read the estimator catalogue.");
    expect(screen.queryByText("No active Main Baskets are available in the estimator catalogue.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry catalogue" })).not.toBeInTheDocument();
  });

  it("uses the legacy save shape after an older catalogue service rejects the ready flag", async () => {
    const readyFlags: Array<string | null> = [];
    const saves: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(null);
      if (url.includes("/estimation/catalogue?")) {
        const readyFlag = new URL(url, "http://localhost").searchParams.get("includeReadyNonActive");
        readyFlags.push(readyFlag);
        return readyFlag
          ? Response.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", fields: { includeReadyNonActive: "Unrecognized field" } } }, { status: 400 })
          : response({ items: [{ id: "basket-active", name: "Active basket", displayOrder: 1, subBaskets: [{ id: "sub-active", basketId: "basket-active", name: "Painting", displayOrder: 1, mainLines: [{ id: "line-active", mainLineId: "line-active", basketId: "basket-active", subBasketId: "sub-active", name: "Wall paint", displayOrder: 1, revisionId: "revision-active", uom: { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 } }] }] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        const line = (payload.lineItems as Array<Record<string, unknown>>)[0]!;
        if ("itemType" in line || "itemVersion" in line || "revisionVersion" in line || line.subBasketId === null) {
          return Response.json({ error: { code: "VALIDATION_ERROR", message: "Older save schema rejected the configured line." } }, { status: 400 });
        }
        return response({ ...payload, id: "legacy-compatible-estimate", version: saves.length, lineItems: [{ ...line, id: "saved-active", mainBasketName: "Active basket", subBasketName: "Painting", mainLineName: "Wall paint", uomCode: "SQFT", uomName: "Square foot", uomDecimalScale: 2, unit: "Square foot", specification: null, rate: 20, amount: 20, amountPaise: 2000 }], subtotal: 20, gst: 3.6, total: 23.6, status: "draft", approvalRequired: false });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) Active basket$/ })).toBeEnabled();
    expect(screen.getByText(/This catalogue currently shows Active items only/)).toBeVisible();
    expect(readyFlags).toEqual(["true", null]);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) Active basket$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    await user.click(screen.getByRole("checkbox", { name: /Wall paint/ }));
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Wall paint/ }), "20");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Estimate draft saved.")).toBeVisible();
    expect(saves).toHaveLength(1);
    expect((saves[0]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ source: "configuration", mainBasketId: "basket-active", subBasketId: "sub-active", mainLineId: "line-active", ratePaise: 2000 });
    const rate = screen.getByRole("textbox", { name: /Selling rate.*Wall paint/ });
    await user.clear(rate);
    await user.type(rate, "25");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "saved-active", ratePaise: 2500 });
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).not.toHaveProperty("itemType");
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).not.toHaveProperty("itemVersion");
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).not.toHaveProperty("revisionVersion");
  });

  it("does not send a temporary saved line to an older backend that cannot accept it", async () => {
    const savedEstimate = {
      id: "estimate-temporary", version: 1, propertyType: "2BHK",
      rooms: [{ id: "room-a", label: "Living & Dining", typeId: "living", icon: "", sqft: 300, length: null, width: null }],
      scopes: [], selectedMainBasketIds: ["basket-active"], status: "draft", approvalRequired: false,
      lineItems: [{ id: "saved-temporary", source: "configuration", itemType: "temporary", catalogueId: "temporary-direct", roomId: "room-a", roomName: "Living & Dining", mainBasketId: "basket-active", mainBasketName: "Active basket", subBasketId: null, subBasketName: null, mainLineId: "temporary-direct", mainLineName: "Site protection", revisionId: "revision-direct", sourceItemStatus: "active", sourceRevisionStatus: "active", sourceItemVersion: 2, sourceRevisionVersion: 1, uomId: "uom-each", uomCode: "NOS", uomName: "Each", uomDecimalScale: 0, unit: "Each", specification: null, rate: 10, ratePaise: 1000, quantity: 1, included: true, amount: 10, amountPaise: 1000 }],
      subtotal: 10, gst: 1.8, total: 11.8
    };
    let saveRequests = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(savedEstimate);
      if (url.includes("/estimation/catalogue?") && method === "GET") {
        const readyFlag = new URL(url, "http://localhost").searchParams.get("includeReadyNonActive");
        return readyFlag
          ? Response.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", fields: { includeReadyNonActive: "Unrecognized field" } } }, { status: 400 })
          : response({ items: [{ id: "basket-active", name: "Active basket", displayOrder: 1, subBaskets: [], directTemporaryItems: [] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        saveRequests += 1;
        throw new Error("Temporary line must not reach the older save schema");
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("region", { name: "Saved items unavailable in current Configuration" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByText(/This catalogue service cannot save temporary items yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(saveRequests).toBe(0);
  });

  it("refreshes changed Draft source versions before retrying a rejected first save", async () => {
    const basket = (revisionVersion: number) => ({
      id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [],
      subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1, mainLines: [], temporaryItems: [{
        id: "temporary-cove", mainLineId: "temporary-cove", itemType: "temporary", basketId: "basket-pop", subBasketId: "sub-na", name: "Cove in Gypsum", displayOrder: 1,
        revisionId: revisionVersion === 2 ? "revision-cove" : "revision-cove-next", itemStatus: "draft", revisionStatus: "draft", itemVersion: 5, revisionVersion,
        uom: revisionVersion === 2
          ? { id: "uom-rft", code: "RFT", name: "Running foot", decimalScale: 2 }
          : { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 }
      }] }]
    });
    const saves: Array<Record<string, unknown>> = [];
    let catalogueReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(null);
      if (url.includes("/estimation/catalogue?") && method === "GET") {
        catalogueReads += 1;
        return response({ items: [basket(catalogueReads === 1 ? 2 : 3)], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        saves.push(payload);
        if (saves.length === 1) return Response.json({ error: { code: "ESTIMATE_CATALOGUE_CHANGED", message: "Source changed." } }, { status: 409 });
        const line = (payload.lineItems as Array<Record<string, unknown>>)[0]!;
        return response({ ...payload, id: "estimate-1", version: 1, lineItems: [{ ...line, id: "saved-cove", mainBasketName: "POP / Gypsum", subBasketName: "NA", mainLineName: "Cove in Gypsum", sourceItemStatus: "draft", sourceRevisionStatus: "draft", sourceItemVersion: 5, sourceRevisionVersion: 3, uomCode: "SQFT", uomName: "Square foot", uomDecimalScale: 2, unit: "Square foot", specification: null, rate: 20, amount: 20, amountPaise: 2000 }], subtotal: 20, gst: 3.6, total: 23.6, status: "draft", approvalRequired: false });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    await user.click(screen.getByRole("checkbox", { name: /Cove in Gypsum/ }));
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Cove in Gypsum/ }), "20");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Configuration changed since you opened this estimate/)).toBeVisible();
    expect((saves[0]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ itemVersion: 5, revisionVersion: 2 });
    await user.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await waitFor(() => expect(catalogueReads).toBe(2));
    await waitFor(() => expect(screen.queryByText(/Configuration changed since you opened this estimate/)).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: /Cove in Gypsum/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /Selling rate.*Cove in Gypsum/ })).toHaveValue("20");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByText(/Unit changed from Running foot to Square foot/)).toBeVisible();
    await user.clear(screen.getByRole("spinbutton", { name: /Quantity \(Square foot\).*Cove in Gypsum/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Quantity \(Square foot\).*Cove in Gypsum/ }), "1");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect((saves[1]!.lineItems as Array<Record<string, unknown>>)[0]).toMatchObject({ revisionId: "revision-cove-next", itemVersion: 5, revisionVersion: 3, uomId: "uom-sqft", ratePaise: 2000 });
    expect(await screen.findByText(/^Draft source$/)).toBeVisible();
  });

  it("separates a missing new selection from saved unavailable items and blocks its first save", async () => {
    const temporaryItem = { id: "temporary-cove", mainLineId: "temporary-cove", itemType: "temporary", basketId: "basket-pop", subBasketId: "sub-na", name: "Cove in Gypsum", displayOrder: 1,
      revisionId: "revision-cove", itemStatus: "inactive", revisionStatus: "active", itemVersion: 5, revisionVersion: 2,
      uom: { id: "uom-rft", code: "RFT", name: "Running foot", decimalScale: 2 } };
    let catalogueReads = 0;
    let saveRequests = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(null);
      if (url.includes("/estimation/catalogue?") && method === "GET") {
        catalogueReads += 1;
        return response({ items: [{ id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [{ id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1, mainLines: [], temporaryItems: catalogueReads === 1 ? [temporaryItem] : [] }] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
        saveRequests += 1;
        throw new Error("Unavailable first save should be blocked in the builder");
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    await user.click(screen.getByRole("checkbox", { name: /Cove in Gypsum/ }));
    await user.type(screen.getByRole("textbox", { name: /Selling rate.*Cove in Gypsum/ }), "20");
    await user.click(screen.getAllByRole("button", { name: "Refresh available items" })[0]!);
    const unavailable = await screen.findByRole("region", { name: "Unavailable new selections" });
    expect(within(unavailable).getByRole("checkbox", { name: /Cove in Gypsum/ })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Saved items unavailable in current Configuration" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByText(/A Main Line is no longer available in Configuration/)).toBeVisible();
    await user.click(within(unavailable).getByRole("checkbox", { name: /Cove in Gypsum/ }));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(saveRequests).toBe(0);
  });

  it("refreshes a successful empty catalogue in place and reveals new grouped and direct items", async () => {
    const emptyBasket = { id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [
      { id: "sub-na", basketId: "basket-pop", name: "NA", displayOrder: 1, mainLines: [], temporaryItems: [] }
    ] };
    const populatedBasket = { ...emptyBasket,
      directTemporaryItems: [{ id: "direct-protection", mainLineId: "direct-protection", basketId: "basket-pop", subBasketId: null, itemType: "temporary", name: "Site protection", displayOrder: 1, revisionId: "revision-direct", uom: { id: "uom-each", code: "NOS", name: "each", decimalScale: 0 } }],
      subBaskets: [{ ...emptyBasket.subBaskets[0]!, mainLines: [
        { id: "line-gypsum", mainLineId: "line-gypsum", basketId: "basket-pop", subBasketId: "sub-na", itemType: "main_line", name: "Gypsum finishing", displayOrder: 1, revisionId: "revision-line", uom: { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 } }
      ] }]
    };
    const pendingRefresh = deferred<Response>();
    let catalogueReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-1/estimate")) return response(null);
      if (url.includes("/estimation/catalogue?")) {
        catalogueReads += 1;
        if (catalogueReads === 3) return pendingRefresh.promise;
        if (catalogueReads === 4) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed" } }, { status: 503 });
        if (catalogueReads === 5) return response({ items: [populatedBasket], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
        return response({ items: [emptyBasket], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(catalogueReads).toBe(2));
    expect(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("region", { name: "NA" })).toBeVisible();
    expect(screen.getByText("No available items in this Sub Basket.")).toBeVisible();
    expect(screen.getByText(/No available items in this Main Basket/)).toBeVisible();

    await user.click(within(screen.getByRole("region", { name: "POP / Gypsum" })).getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(catalogueReads).toBe(3));
    expect(screen.getByText("Refreshing available items…")).toBeVisible();
    for (const button of screen.getAllByRole("button", { name: "Refresh available items" })) expect(button).toBeDisabled();
    pendingRefresh.resolve(response({ items: [populatedBasket], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 0 }));
    expect(await screen.findByRole("checkbox", { name: /Gypsum finishing/ })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Site protection/ })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Direct items in POP / Gypsum" })).toBeVisible();
    expect(screen.getByRole("region", { name: "NA" })).toBeVisible();
    expect(screen.queryByText(/No available items in this Main Basket/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Rooms" })).toHaveTextContent("Living & Dining");
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Available items could not be refreshed. The last loaded catalogue is shown. Try again.");
    expect(screen.getByRole("checkbox", { name: /Gypsum finishing/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(catalogueReads).toBe(5));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ })).not.toHaveAccessibleDescription();
  });

  const clientFeedback = {
    note: "Reduce the false ceiling to 120 sqft. Keep the current finish.",
    occurredAt: "2026-09-30T10:15:00.000Z",
    reviewRoundId: "round-1"
  };

  it("keeps Client feedback through editing and draft save, then clears it after the new submitted round is confirmed", async () => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback };
    const revisedDraft = {
      ...initial,
      status: "draft" as const,
      lineItems: initial.lineItems.map((line) => ({ ...line, quantity: 120 }))
    };
    const published = {
      ...revisedDraft,
      status: "sent_to_client" as const,
      clientReview: reviewSummary("disabled", { id: "round-2", estimateVersion: 6 }),
      clientFeedback: null
    };
    const harness = installWorkspaceHarness({
      initialEstimate: initial,
      refetchedEstimate: revisedDraft,
      publication: { endpoint: "submit", result: published, response: { ...published, clientFeedback: undefined }, deferRefetch: true }
    });
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    renderWorkspace();

    const feedback = await screen.findByRole("region", { name: "Changes requested" });
    expect(within(feedback).getByText(clientFeedback.note)).toBeVisible();
    expect(feedback.querySelector("time")).toHaveAttribute("datetime", clientFeedback.occurredAt);
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity);
    await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(harness.counts.estimateGets).toBe(1);
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /false ceiling.*quantity/i })).toHaveValue(120);
    const saveRequest = harness.requests.find((request) => request.method === "PUT");
    expect(JSON.parse(String(saveRequest?.body)).lineItems[0].quantity).toBe(120);

    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    await screen.findByText(/Submitted to the client portal for approval/);
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
    harness.releaseRefetch();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument());
    expect(harness.counts.submits).toBe(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: estimateWorkflowKeys.client });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientKeys.projects });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
  });

  it("labels retained feedback as stale and prevents repeat submission when publication succeeds but refresh fails", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const published = { ...estimateFixture("sent_to_client", reviewSummary("disabled")), clientFeedback: null };
    const options: WorkspaceHarnessOptions = {
      initialEstimate: initial,
      refetchedEstimate: published,
      publication: { endpoint: "submit", result: published, response: { ...published, clientFeedback: undefined } },
      refetchFailure: true
    };
    const harness = installWorkspaceHarness(options);
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));

    const feedback = screen.getByRole("region", { name: "Changes requested" });
    expect(await within(feedback).findByRole("alert")).toHaveTextContent("The latest feedback could not be loaded.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    options.refetchFailure = false;
    await user.click(screen.getByRole("button", { name: "Refresh feedback" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument());
    expect(harness.counts.submits).toBe(1);
  });

  it.each(["save", "submit"] as const)("retains the Client request and edited values when %s fails", async (failure) => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback };
    const harness = installWorkspaceHarness({ initialEstimate: initial, refetchedEstimate: initial, failure });
    const user = userEvent.setup();
    renderWorkspace();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity);
    await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: failure === "save" ? "Save draft" : "Submit estimate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The estimate action could not be completed.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(quantity).toHaveValue(120);
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled();
    expect(harness.counts.submits).toBe(failure === "save" ? 0 : 1);
  });

  it("retains Client feedback while a revised estimate awaits design approval", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const awaitingDesign = { ...initial, status: "pending_manager_assignment" as const, approvalRequired: true };
    installWorkspaceHarness({
      initialEstimate: initial,
      refetchedEstimate: awaitingDesign,
      publication: { endpoint: "submit", result: awaitingDesign }
    });
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
    await screen.findByText("Submitted. A design manager must now assign a designer for approval.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument());
  });

  it("shows useful legacy empty-note feedback separately from design requests", async () => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback: { ...clientFeedback, note: "  ", reviewRoundId: null } };
    installWorkspaceHarness({ initialEstimate: initial, refetchedEstimate: initial });
    renderWorkspace();
    const feedback = await screen.findByRole("region", { name: "Changes requested" });
    expect(within(feedback).getByText(/The client requested changes without an explanation/)).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Plan change requests" })).toBeVisible();
    expect(within(feedback).queryByText("No open plan requests.")).not.toBeInTheDocument();
  });

  it("does not carry feedback into another project's estimate after navigation", async () => {
    const first = { ...estimateFixture("draft"), clientFeedback };
    const second = {
      ...estimateFixture("client_approved"), id: "estimate-2", subtotal: 60000, gst: 10800, total: 70800,
      lineItems: first.lineItems.map((line) => ({ ...line, rate: 120, quantity: 500 })), clientFeedback: null
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1/estimate")) return response(first);
      if (url.endsWith("/leads/lead-2/estimate")) return response(second);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-2")) return response({ ...leadFixture, id: "lead-2", projectName: "Neel villa", clientName: "Neel Roy" });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Link to="/estimator-sales/leads/lead-2/estimate">Open Neel villa</Link>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(clientFeedback.note)).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Open Neel villa" }));
    await screen.findByText("Neel villa · Pune");
    expect(await screen.findByText("₹70,800")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument();
    expect(screen.queryByText(clientFeedback.note)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
  });

  it("keeps a delayed submission attached to its originating lead after navigation", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const published = { ...estimateFixture("sent_to_client"), clientFeedback: null };
    const second = {
      ...estimateFixture("draft"), id: "estimate-2", subtotal: 60000, gst: 10800, total: 70800,
      lineItems: initial.lineItems.map((line) => ({ ...line, rate: 120, quantity: 500 })),
      clientFeedback: { ...clientFeedback, note: "Use oak finish in the villa.", reviewRoundId: "round-8" }
    };
    const pendingSubmission = deferred<Response>();
    let publishedFirst = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1/estimate/submit")) return pendingSubmission.promise;
      if (url.endsWith("/leads/lead-1/estimate") && init?.method === "PUT") return response(initial);
      if (url.endsWith("/leads/lead-1/estimate")) return response(publishedFirst ? published : initial);
      if (url.endsWith("/leads/lead-2/estimate")) return response(second);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-2")) return response({ ...leadFixture, id: "lead-2", projectName: "Neel villa", clientName: "Neel Roy" });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Link to="/estimator-sales/leads/lead-2/estimate">Open Neel villa</Link>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
    await user.click(screen.getByRole("link", { name: "Open Neel villa" }));
    await screen.findByText("Neel villa · Pune");
    publishedFirst = true;
    pendingSubmission.resolve(response(published));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled());
    expect(screen.getByText(second.clientFeedback.note)).toBeVisible();
    expect(screen.getByText("₹70,800")).toBeVisible();
    expect(screen.queryByText(/Submitted to the client portal for approval/)).not.toBeInTheDocument();
  });

  it("posts the exact current round and version to the encoded email-retry endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const summary = reviewSummary("sent");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ url: String(input), init });
      return response(summary);
    });
    await expect(
      retryEstimateClientEmail("estimate-1", { roundId: "round-1", version: 3 })
    ).resolves.toEqual(summary);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("/api/v1/estimates/estimate-1/client-email/retry");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBe('{"roundId":"round-1","version":3}');
  });

  it.each(["queued", "sent", "failed", "disabled"] as const)(
    "uses the low-value %s publication result for notice copy and retains it after the immediate refetch",
    async (deliveryStatus) => {
      const initial = estimateFixture("draft");
      const published = estimateFixture("sent_to_client", reviewSummary(deliveryStatus));
      const harness = installWorkspaceHarness({
        initialEstimate: initial,
        refetchedEstimate: published,
        publication: { endpoint: "submit", result: published, deferRefetch: true }
      });
      const user = userEvent.setup();
      renderWorkspace();

      await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
      const notice = await screen.findByText(/Submitted.*client portal/i);
      expect(notice).toHaveAttribute("role", "status");
      expect(notice).toHaveTextContent(deliveryCopy[deliveryStatus]);
      expect(harness.counts.submits).toBe(1);
      expect(harness.counts.sends).toBe(0);
      expect(harness.counts.estimateGets).toBe(2);

      harness.releaseRefetch();
      const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByText(deliveryCopy[deliveryStatus])).toBeVisible();
      expect(harness.counts.submits).toBe(1);
      expect(harness.counts.sends).toBe(0);
    }
  );

  it.each(["queued", "sent", "failed", "disabled"] as const)(
    "uses the high-value %s send result for notice copy and retains it after the immediate refetch",
    async (deliveryStatus) => {
      const initial = estimateFixture("ready_for_client");
      const published = estimateFixture("sent_to_client", reviewSummary(deliveryStatus));
      const harness = installWorkspaceHarness({
        initialEstimate: initial,
        refetchedEstimate: published,
        publication: { endpoint: "send", result: published, deferRefetch: true }
      });
      const user = userEvent.setup();
      renderWorkspace();

      await user.click(await screen.findByRole("button", { name: "Send to client" }));
      const notice = await screen.findByText(/client portal/i);
      expect(notice).toHaveAttribute("role", "status");
      expect(notice).toHaveTextContent(deliveryCopy[deliveryStatus]);
      expect(harness.counts.saves).toBe(0);
      expect(harness.counts.submits).toBe(0);
      expect(harness.counts.sends).toBe(1);
      expect(harness.counts.estimateGets).toBe(2);

      harness.releaseRefetch();
      const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByText(deliveryCopy[deliveryStatus])).toBeVisible();
      expect(harness.counts.submits).toBe(0);
      expect(harness.counts.sends).toBe(1);
    }
  );

  it("retries only the exact failed round, refetches its updated state, and never replays Submit or Send", async () => {
    const failed = reviewSummary("failed");
    const sent = reviewSummary("sent", { version: 4, deliveryAttemptCount: 2 });
    const harness = installWorkspaceHarness({
      initialEstimate: estimateFixture("sent_to_client", failed),
      refetchedEstimate: estimateFixture("sent_to_client", sent),
      retry: { result: sent }
    });
    const user = userEvent.setup();
    renderWorkspace();

    const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
    await user.click(within(delivery).getByRole("button", { name: "Retry email" }));

    expect(await screen.findByText("Estimate email delivery updated.")).toHaveAttribute(
      "role",
      "status"
    );
    await waitFor(() => expect(harness.counts.estimateGets).toBe(2));
    expect(
      within(screen.getByRole("region", { name: "Estimate email delivery" })).getByText(
        "Email sent"
      )
    ).toBeVisible();
    expect(harness.counts).toEqual({
      estimateGets: 2,
      saves: 0,
      submits: 0,
      sends: 0,
      retries: 1
    });
    const posts = harness.requests.filter((request) => request.method === "POST");
    expect(posts).toEqual([
      expect.objectContaining({
        url: "/api/v1/estimates/estimate-1/client-email/retry",
        body: '{"roundId":"round-1","version":3}'
      })
    ]);
  });

  it("announces a 409 as stale, refetches once, and does not replay retry, Submit, or Send", async () => {
    const failed = reviewSummary("failed");
    const queued = reviewSummary("queued", { version: 4, deliveryAttemptCount: 2 });
    const harness = installWorkspaceHarness({
      initialEstimate: estimateFixture("sent_to_client", failed),
      refetchedEstimate: estimateFixture("sent_to_client", queued),
      retry: { conflict: true }
    });
    const user = userEvent.setup();
    renderWorkspace();

    const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
    await user.click(within(delivery).getByRole("button", { name: "Retry email" }));

    expect(
      await screen.findByText("Email delivery changed. Refreshed the latest status.")
    ).toHaveAttribute("role", "alert");
    await waitFor(() => expect(harness.counts.estimateGets).toBe(2));
    expect(
      within(screen.getByRole("region", { name: "Estimate email delivery" })).getByText(
        "Email queued"
      )
    ).toBeVisible();
    expect(harness.counts).toEqual({
      estimateGets: 2,
      saves: 0,
      submits: 0,
      sends: 0,
      retries: 1
    });
    const posts = harness.requests.filter((request) => request.method === "POST");
    expect(posts).toEqual([
      expect.objectContaining({
        url: "/api/v1/estimates/estimate-1/client-email/retry",
        body: '{"roundId":"round-1","version":3}'
      })
    ]);
  });

  it("does not render or request the design upload workspace for an estimator", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/leads/lead-1")) {
        return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      }
      if (url.endsWith("/leads/lead-1/estimate")) {
        return response({ id: "estimate-1", propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null }], scopes: ["FC"], lineItems: [], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Upload design plans" })
    ).not.toBeInTheDocument();
    expect(
      requests.some((url) => url.endsWith("/estimates/estimate-1/design-uploads"))
    ).toBe(false);
  });
});

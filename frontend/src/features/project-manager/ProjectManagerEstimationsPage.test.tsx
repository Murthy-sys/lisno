import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectManagerEstimationsPage, pmEstimateReturnPath } from "./ProjectManagerEstimationsPage";
import { pmEstimateKeys } from "./pmEstimatesApi";
import type { PMApprovedSourceRef, PMEstimateView, PMMainLineScope, PMVendorCandidate, PMVendorSuggestion, PMVendorSuggestionCreate, PMVendorSuggestionUpdate } from "./pmEstimateTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-a", role: "site_manager", name: "Manager A" } }) }));

const source: PMApprovedSourceRef = { estimateId: "estimate-a", estimateVersion: 3, estimateReviewRoundId: "approved-round-a", phase: "post", designPlanVersion: 0, sourceSnapshotId: "approved-round-a", sourceDigest: "a".repeat(64) };
const lineOne: PMMainLineScope = { mainLineId: "main-line-one", mainLineName: "Oak panelling", mainBasketId: "basket-one", mainBasketName: "Carpentry", occurrences: [
  { sourceLineItemKey: "scope-one", sectionId: "room-one", roomId: "room-one", roomName: "Living room" },
  { sourceLineItemKey: "scope-two", sectionId: "room-two", roomId: "room-two", roomName: "Bedroom" }
], scopeDigest: "1".repeat(64), canSuggest: true, unavailableReason: null };
const lineTwo: PMMainLineScope = { ...lineOne, mainLineId: "main-line-two", mainLineName: "Wardrobe", occurrences: [{ sourceLineItemKey: "scope-three", sectionId: "room-two", roomId: "room-two", roomName: "Bedroom" }], scopeDigest: "2".repeat(64) };
const approved: PMEstimateView = {
  project: { id: "project-a", name: "Cedar residence" }, availability: "available", reason: null, source, approvedAt: "2026-10-20T10:00:00.000Z",
  lines: [
    { ...lineOne.occurrences[0]!, mainLineId: lineOne.mainLineId, mainLineName: lineOne.mainLineName, mainBasketId: "basket-one", mainBasketName: "Carpentry", specification: "Saved approved timber specification", included: true, quantity: 2, unit: "sq ft", ratePaise: 12345, amountPaise: 24690, dimensions: [{ label: "Length", value: "2.050", unit: "ft" }] },
    { ...lineOne.occurrences[1]!, mainLineId: lineOne.mainLineId, mainLineName: lineOne.mainLineName, mainBasketId: "basket-one", mainBasketName: "Carpentry", specification: "Bedroom approved specification", included: true, quantity: 1, unit: "sq ft", ratePaise: null, amountPaise: 0, dimensions: [] },
    { ...lineTwo.occurrences[0]!, mainLineId: lineTwo.mainLineId, mainLineName: lineTwo.mainLineName, mainBasketId: "basket-one", mainBasketName: "Carpentry", specification: "Saved wardrobe scope", included: true, quantity: 1, unit: "item", ratePaise: 25000, amountPaise: 25000, dimensions: [] },
    { sourceLineItemKey: "excluded", sectionId: "room-one", roomId: "room-one", roomName: "Living room", mainLineId: null, mainLineName: "Excluded console", mainBasketId: null, mainBasketName: null, specification: "Excluded optional scope", included: false, quantity: 1, unit: "item", ratePaise: 50000, amountPaise: 50000, dimensions: [] }
  ],
  mainLines: [lineOne, lineTwo], totals: { subtotalPaise: 49690, gstPaise: 8944, totalPaise: 58634 }, writeAvailability: { available: true, reason: null }
};
let view: PMEstimateView;
let records: PMVendorSuggestion[];
let creates: PMVendorSuggestionCreate[];
let updates: PMVendorSuggestionUpdate[];
let client: QueryClient;
let linkedVendors: Record<string, PMVendorCandidate[]>;

function suggestion(id = "suggestion-one", line = lineOne): PMVendorSuggestion {
  return { id, projectId: "project-a", source: view.source, storedSource: { estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId, designPlanVersion: 0 }, scope: "main_line", mainLine: line,
    vendor: { id: "vendor-one", code: "V-01", name: "Oak Works" }, note: "Prior experience with this timber.", status: "suggested", version: 1,
    suggestedBy: { id: "pm-a", name: "Manager A" }, updatedBy: { id: "pm-a", name: "Manager A" }, createdAt: "2026-10-25T10:00:00.000Z", updatedAt: "2026-10-25T10:00:00.000Z",
    sourceState: "current", canEdit: true, editUnavailableReason: null, reinstatementAvailability: { available: false, reason: "This suggestion is not withdrawn." }, bidEligible: true, readinessReasons: [], activity: { availability: "available", items: [], truncated: false } };
}

function QueryControls() {
  client = useQueryClient();
  return <button onClick={() => void client.refetchQueries({ queryKey: pmEstimateKeys.all })}>Refresh protected queries</button>;
}
function mount(path = "/projects/project-a/estimations") {
  return renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/projects/:projectId/estimations" element={<ProjectManagerEstimationsPage />} /></Routes><QueryControls /></MemoryRouter>);
}

beforeEach(() => {
  view = structuredClone(approved); records = []; creates = []; updates = [];
  const shared: PMVendorCandidate = { id: "vendor-one", code: "V-01", name: "Oak Works", classification: ["Carpentry"], canSuggest: true, bidEligible: true, reasons: [] };
  linkedVendors = {
    "main-line-one": [shared, { id: "vendor-two", code: "V-02", name: "Inactive Works", classification: ["Carpentry"], canSuggest: false, bidEligible: false, reasons: ["Vendor is inactive."] }],
    "main-line-two": [shared, { id: "vendor-three", code: "V-03", name: "Wardrobe workshop", classification: ["Carpentry"], canSuggest: true, bidEligible: true, reasons: [] }]
  };
  server.use(
    http.get("/api/v1/projects/project-a/pm/estimate", () => HttpResponse.json({ data: view })),
    http.get("/api/v1/projects/project-a/pm/vendor-suggestions", ({ request }) => {
      const query = new URL(request.url).searchParams;
      const line = query.get("mainLineId");
      const filtered = records.filter(record => (!line || record.mainLine?.mainLineId === line) && (query.get("source") !== "history" || record.sourceState !== "current"));
      const offset = Number(query.get("offset"));
      return HttpResponse.json({ data: { source: view.source, items: filtered.slice(offset, offset + 20), total: filtered.length, limit: 20, offset, writeAvailability: view.writeAvailability } });
    }),
    http.get("/api/v1/projects/project-a/pm/vendor-suggestion-candidates", ({ request }) => {
      const query = new URL(request.url).searchParams;
      const selectedSource = JSON.parse(query.get("expectedSource")!) as PMApprovedSourceRef;
      const items = (linkedVendors[query.get("mainLineId")!] ?? []).filter(vendor => `${vendor.name} ${vendor.code}`.toLowerCase().includes((query.get("q") ?? "").toLowerCase()));
      const offset = Number(query.get("offset") ?? 0);
      return HttpResponse.json({ data: { source: selectedSource, mainLine: view.mainLines.find(line => line.mainLineId === query.get("mainLineId")), total: items.length, limit: 20, offset,
        items: items.slice(offset, offset + 20) } });
    }),
    http.post("/api/v1/projects/project-a/pm/vendor-suggestions", async ({ request }) => {
      const body = await request.json() as PMVendorSuggestionCreate; creates.push(body);
      const record = suggestion(`suggestion-${records.length + 1}`, view.mainLines.find(line => line.mainLineId === body.mainLineId)!);
      record.note = body.note; records.push(record);
      return HttpResponse.json({ data: { id: record.id, version: record.version, status: record.status } }, { status: 201 });
    }),
    http.patch("/api/v1/projects/project-a/pm/vendor-suggestions/:suggestionId", async ({ request, params }) => {
      const body = await request.json() as PMVendorSuggestionUpdate; updates.push(body);
      const record = records.find(item => item.id === params.suggestionId)!;
      record.note = body.note; record.status = body.status; record.version += 1;
      const canReinstate = body.status === "withdrawn" && linkedVendors[record.mainLine!.mainLineId]?.some(vendor => vendor.id === record.vendor.id && vendor.canSuggest);
      record.reinstatementAvailability = { available: Boolean(canReinstate), reason: canReinstate ? null : "Current vendor link or status is unavailable for reinstatement." };
      return HttpResponse.json({ data: { id: record.id, version: record.version, status: record.status } });
    })
  );
});

async function openCreate(line = "Oak panelling", room = "Living room") {
  const trigger = await screen.findByRole("button", { name: `Suggest vendor for ${line} in ${room}` });
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.click(trigger);
  return screen.findByRole("dialog", { name: "Suggest a vendor" });
}

describe("Project Manager approved estimations", () => {
  it("shows the chosen Main Line's linked vendors in the shared picker", async () => {
    mount();
    let dialog = await openCreate();
    expect(await within(dialog).findByRole("group", { name: "Vendors linked in Configuration" })).toBeVisible();
    expect(within(dialog).getByRole("radio", { name: /Inactive Works/ })).toBeDisabled();
    expect(within(dialog).queryByRole("radio", { name: /Wardrobe workshop/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("2 linked vendors")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = await openCreate("Wardrobe", "Bedroom");
    expect(await within(dialog).findByRole("radio", { name: /Wardrobe workshop/ })).toBeEnabled();
    expect(within(dialog).queryByRole("radio", { name: /Inactive Works/ })).not.toBeInTheDocument();
  });

  it("resets the draft and candidate page only when a different Main Line is chosen", async () => {
    linkedVendors["main-line-one"] = Array.from({ length: 23 }, (_, index) => ({
      id: `linked-${index}`, code: `LINK-${index}`, name: `Linked contractor ${index}`, classification: [], canSuggest: true, bidEligible: true, reasons: []
    }));
    mount();
    const dialog = await openCreate();
    await within(dialog).findByText("23 linked vendors");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next vendors" }));
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Linked contractor 22 / }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Only for the first Main Line.");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Main Line" }), "main-line-two");
    expect(await within(dialog).findByRole("radio", { name: /Wardrobe workshop/ })).toBeEnabled();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Previous vendors" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).getAllByRole("radio").every(input => !(input as HTMLInputElement).checked)).toBe(true);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search linked vendors" }), "Wardrobe");
    await within(dialog).findByText("1 linked vendors");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Main Line" }), "main-line-one");
    await within(dialog).findByText("23 linked vendors");
    expect(within(dialog).getByRole("textbox", { name: "Search linked vendors" })).toHaveValue("");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(20);
    expect(screen.getAllByRole("dialog", { name: "Suggest a vendor" })).toHaveLength(1);
  });

  it("cannot reset a pending create by choosing another vendor or Main Line", async () => {
    let finishRequest!: () => void;
    const pendingResponse = new Promise<void>(resolve => { finishRequest = resolve; });
    server.use(http.post("/api/v1/projects/project-a/pm/vendor-suggestions", async ({ request }) => {
      const body = await request.json() as PMVendorSuggestionCreate; creates.push(body);
      await pendingResponse;
      return HttpResponse.json({ data: { id: "created-suggestion", version: 1, status: "suggested" } }, { status: 201 });
    }));
    mount();
    const dialog = await openCreate("Wardrobe", "Bedroom");
    const oak = await within(dialog).findByRole("radio", { name: /Oak Works/ });
    const alternate = within(dialog).getByRole("radio", { name: /Wardrobe workshop/ });
    const line = within(dialog).getByRole("combobox", { name: "Main Line" });
    const note = within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" });
    await userEvent.click(oak);
    await userEvent.type(note, "Keep the submitted Wardrobe scope.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    await waitFor(() => expect(creates).toHaveLength(1));
    expect(alternate).toBeDisabled(); expect(line).toBeDisabled(); expect(note).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Search linked vendors" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Next vendors" })).toBeDisabled();
    await userEvent.click(alternate);
    await userEvent.selectOptions(line, "main-line-one");
    await userEvent.keyboard("{Enter}");
    expect(oak).toBeChecked(); expect(alternate).not.toBeChecked();
    expect(line).toHaveValue("main-line-two"); expect(note).toHaveValue("Keep the submitted Wardrobe scope.");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ mainLineId: "main-line-two", vendorId: "vendor-one", expectedSource: source, note: "Keep the submitted Wardrobe scope." });
    finishRequest();
    await screen.findByText("Suggestion saved for Procurement to review.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(creates).toHaveLength(1);
  });

  it("preserves the selected line and note when current scope temporarily disappears", async () => {
    mount();
    const dialog = await openCreate();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep the original scope for review.");
    view.mainLines = [lineTwo]; view.source = null;
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all, type: "active", predicate: query => !query.queryKey.includes("candidates") }); });
    expect(await within(dialog).findByText("The approved source changed. Your note is preserved.")).toBeVisible();
    expect(within(dialog).getByRole("combobox", { name: "Main Line" })).toHaveValue("main-line-one");
    expect(within(dialog).getByRole("combobox", { name: "Main Line" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep the original scope for review.");
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(creates).toEqual([]);
  });

  it("shows compact saved rows with provenance and bid activity inside details", async () => {
    records = [suggestion()];
    mount();
    const row = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    expect(within(row).getByRole("heading", { name: "Oak Works" })).toBeVisible();
    expect(within(row).getByText("Oak panelling")).toBeVisible();
    expect(within(row).getByText("Suggested")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Edit note" })).toBeVisible();
    expect(within(row).getByText(/Manager A ·/)).not.toBeVisible();
    expect(within(row).getByText("Current approved source")).not.toBeVisible();
    expect(within(row).getByText("No matching bid request")).not.toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Vendor suggestion pages" })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByText("Suggestion details"));
    expect(within(row).getByText(/Manager A ·/)).toBeVisible();
    expect(within(row).getByText("No matching bid request")).toBeVisible();
  });

  it("refreshes a valid saved page when a later page becomes out of range", async () => {
    records = Array.from({ length: 23 }, (_, index) => ({ ...suggestion(`saved-${index}`), vendor: { id: `vendor-${index}`, code: `V-${index}`, name: `Saved contractor ${index}` } }));
    mount();
    await screen.findByRole("article", { name: "Saved contractor 0 for Oak panelling" });
    await userEvent.click(screen.getByRole("button", { name: "Next suggestions" }));
    await screen.findByRole("article", { name: "Saved contractor 22 for Oak panelling" });
    records = records.slice(0, 5);
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all, type: "active", predicate: query => query.queryKey.includes("suggestions") }); });
    expect(await screen.findByRole("article", { name: "Saved contractor 0 for Oak panelling" })).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
    expect(screen.queryByText("No suggested vendors yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Vendor suggestion pages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Saved contractor 5 for Oak panelling" })).not.toBeInTheDocument();
  });

  it("does not claim the saved list is empty after a cached-empty refresh fails", async () => {
    mount();
    await screen.findByText("No suggested vendors yet.");
    server.use(http.get("/api/v1/projects/project-a/pm/vendor-suggestions", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporarily unavailable." } }, { status: 503 })));
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all, type: "active", predicate: query => query.queryKey.includes("suggestions") }); });
    expect(await screen.findByText(/Refresh failed. Saved details may be out of date/)).toBeVisible();
    expect(screen.queryByText("No suggested vendors yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest vendor" })).toBeDisabled();
  });

  it("distinguishes an empty Configuration list from a search without matches", async () => {
    linkedVendors["main-line-one"] = [];
    mount();
    const dialog = await openCreate();
    expect(await within(dialog).findByText("No vendors are linked to this Main Line in Configuration.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search linked vendors" }), "missing");
    expect(await within(dialog).findByText("No linked vendors match this search.")).toBeVisible();
    expect(within(dialog).queryByText("No vendors are linked to this Main Line in Configuration.")).not.toBeInTheDocument();
  });

  it("does not present a cached empty list as current when vendor Configuration becomes unavailable", async () => {
    let unavailable = false;
    server.use(http.get("/api/v1/projects/project-a/pm/vendor-suggestion-candidates", () => unavailable
      ? HttpResponse.json({ error: { code: "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE", message: "Current vendor Configuration needs correction." } }, { status: 409 })
      : HttpResponse.json({ data: { source, mainLine: lineOne, total: 0, offset: 0, limit: 20, items: [] } })));
    mount();
    const dialog = await openCreate();
    expect(await within(dialog).findByText("No vendors are linked to this Main Line in Configuration.")).toBeVisible();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep this context during lookup repair.");
    unavailable = true;
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all, type: "active", predicate: query => query.queryKey.includes("candidates") }); });
    expect(await within(dialog).findByText("Current vendor Configuration needs correction.")).toBeVisible();
    expect(within(dialog).queryByText("No vendors are linked to this Main Line in Configuration.")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("0 linked vendors")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Refresh linked vendors" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep this context during lookup repair.");
  });

  it("distinguishes an emptied later page from an empty linked set after the list shrinks", async () => {
    linkedVendors["main-line-one"] = Array.from({ length: 23 }, (_, index) => ({
      id: `linked-${index}`, code: `LINK-${index}`, name: `Linked contractor ${index}`, classification: [], canSuggest: true, bidEligible: true, reasons: []
    }));
    mount();
    const dialog = await openCreate();
    await within(dialog).findByText("23 linked vendors");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next vendors" }));
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Linked contractor 22 / }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep this note when the page changes.");
    linkedVendors["main-line-one"] = linkedVendors["main-line-one"]!.slice(0, 5);
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all, type: "active", predicate: query => query.queryKey.includes("candidates") }); });
    expect(await within(dialog).findByText("No linked vendors are on this page. Use Previous vendors to review the remaining 5.")).toBeVisible();
    expect(within(dialog).queryByText("No vendors are linked to this Main Line in Configuration.")).not.toBeInTheDocument();
    expect(within(dialog).getByText("5 linked vendors")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Previous vendors" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Next vendors" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).getByText("The selected vendor is no longer available for this item. Choose a linked vendor to continue.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep this note when the page changes.");
    expect(creates).toEqual([]);
  });

  it("pages the complete linked list and clears selection when search returns to its first page", async () => {
    linkedVendors["main-line-one"] = Array.from({ length: 23 }, (_, index) => ({
      id: `linked-${index}`, code: `LINK-${index}`, name: `Linked contractor ${index}`, classification: [], canSuggest: true, bidEligible: true, reasons: []
    }));
    mount();
    const dialog = await openCreate();
    expect(await within(dialog).findByText("23 linked vendors")).toBeVisible();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(20);
    await userEvent.click(within(dialog).getByRole("button", { name: "Next vendors" }));
    const radio = await within(dialog).findByRole("radio", { name: /Linked contractor 22 / });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(3);
    await userEvent.click(radio);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Search linked vendors" }), "LINK-1");
    await waitFor(() => expect(within(dialog).getByText("11 linked vendors")).toBeVisible());
    expect(within(dialog).getByRole("button", { name: "Previous vendors" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).getAllByRole("radio").every(input => !(input as HTMLInputElement).checked)).toBe(true);
  });

  it.each(["removed", "inactive"])("clears a selected vendor after a fresh lookup reports it %s", async state => {
    mount();
    const dialog = await openCreate();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep this recommendation context.");
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeEnabled();
    linkedVendors["main-line-one"] = state === "removed" ? [] : linkedVendors["main-line-one"]!.map(vendor => ({ ...vendor, canSuggest: false }));
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all }); });
    expect(await within(dialog).findByText("The selected vendor is no longer available for this item. Choose a linked vendor to continue.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep this recommendation context.");
    expect(within(dialog).queryAllByRole("radio").every(input => !(input as HTMLInputElement).checked)).toBe(true);
    expect(creates).toEqual([]);
  });

  it("recovers a rejected vendor link without rebasing the approved source or losing the note", async () => {
    const originalVendor = linkedVendors["main-line-one"]![0]!;
    server.use(http.post("/api/v1/projects/project-a/pm/vendor-suggestions", async ({ request }) => {
      const body = await request.json() as PMVendorSuggestionCreate; creates.push(body);
      if (creates.length === 1) {
        linkedVendors["main-line-one"] = [];
        return HttpResponse.json({ error: { code: "VENDOR_SUGGESTION_VENDOR_NOT_LINKED", message: "Vendor is no longer linked to this Main Line in Configuration." } }, { status: 409 });
      }
      const record = suggestion(); record.note = body.note; records.push(record);
      return HttpResponse.json({ data: { id: record.id, version: 1, status: "suggested" } }, { status: 201 });
    }));
    mount();
    const dialog = await openCreate();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Retain the note after link removal.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    expect(await within(dialog).findByText("Vendor is no longer linked to this Main Line in Configuration.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Review current scope" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    linkedVendors["main-line-one"] = [originalVendor];
    await userEvent.click(within(dialog).getByRole("button", { name: "Refresh linked vendors" }));
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    await screen.findByText("Suggestion saved for Procurement to review.");
    expect(creates[1]).toMatchObject({ expectedSource: source, note: "Retain the note after link removal." });
  });

  it("shows unavailable vendor Configuration as a retryable lookup error", async () => {
    let broken = true;
    server.use(http.get("/api/v1/projects/project-a/pm/vendor-suggestion-candidates", ({ request }) => broken
      ? HttpResponse.json({ error: { code: "PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE", message: "Current vendor Configuration needs correction." } }, { status: 409 })
      : HttpResponse.json({ data: { source, mainLine: lineOne, total: 2, offset: 0, limit: 20, items: linkedVendors[new URL(request.url).searchParams.get("mainLineId")!] } })));
    mount();
    const dialog = await openCreate();
    expect(await within(dialog).findByText("Current vendor Configuration needs correction.", {}, { timeout: 3000 })).toBeVisible();
    expect(within(dialog).queryByText("No vendors are linked to this Main Line in Configuration.")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Review current scope" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep this lookup note.");
    broken = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Refresh linked vendors" }));
    expect(await within(dialog).findByRole("radio", { name: /Oak Works/ })).toBeEnabled();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep this lookup note.");
  });

  it("keeps all saved project suggestions and history while creating only against current Main Lines", async () => {
    const historicalLine = { ...lineTwo, mainLineId: "former-main-line", mainLineName: "Former cabinet scope" };
    records = [{ ...suggestion("previous-suggestion", historicalLine), vendor: { id: "previous-vendor", code: "PREV", name: "Previous cabinet maker" },
      sourceState: "historical", canEdit: false, editUnavailableReason: "Previous approved source is read only." }];
    const savedQueries: URL[] = [];
    server.use(http.get("/api/v1/projects/project-a/pm/vendor-suggestions", ({ request }) => {
      savedQueries.push(new URL(request.url));
      return HttpResponse.json({ data: { source: view.source, items: records, total: records.length, limit: 20, offset: 0, writeAvailability: view.writeAvailability } });
    }));
    mount();
    const history = await screen.findByRole("article", { name: "Previous cabinet maker for Former cabinet scope" });
    expect(within(history).getAllByText("Previous approved source").some(element => !element.closest("details"))).toBe(true);
    expect(within(history).queryByRole("button", { name: "Edit note" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Suggest vendor" });
    await waitFor(() => expect(trigger).toBeEnabled()); await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Suggest a vendor" });
    expect(within(dialog).getByRole("combobox", { name: "Main Line" })).toHaveValue("main-line-one");
    expect(within(dialog).queryByRole("option", { name: "Former cabinet scope" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("This suggestion uses the current approved source.")).toBeVisible();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    expect(await screen.findByRole("article", { name: "Oak Works for Oak panelling" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Previous cabinet maker for Former cabinet scope" })).toBeVisible();
    expect(creates[0]).toMatchObject({ expectedSource: source, mainLineId: "main-line-one" });
    expect(savedQueries.every(url => url.searchParams.get("source") === "all" && !url.searchParams.has("mainLineId"))).toBe(true);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("preserves note edits and withdrawal after unlinking while disabling reinstatement", async () => {
    linkedVendors["main-line-one"] = [];
    records = [{ ...suggestion(), bidEligible: false, readinessReasons: ["Vendor is no longer linked to this Main Line in Configuration."] }];
    mount();
    const row = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    await waitFor(() => expect(within(row).getByRole("button", { name: "Withdraw" })).toBeEnabled());
    await userEvent.click(within(row).getByRole("button", { name: "Withdraw" }));
    let dialog = await screen.findByRole("dialog", { name: "Withdraw suggestion" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw suggestion" }));
    await screen.findByText("Suggestion withdrawn. Existing bid requests are unchanged.");
    expect(within(row).getByRole("button", { name: "Reinstate" })).toBeDisabled();
    await userEvent.click(within(row).getByRole("button", { name: "Edit note" }));
    dialog = await screen.findByRole("dialog", { name: "Edit suggestion note" });
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Link removed; keep historical context.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    await screen.findByText("Suggestion note updated.");
    expect(updates[1]).toMatchObject({ status: "withdrawn", note: "Link removed; keep historical context." });
    expect(within(row).getByRole("button", { name: "Reinstate" })).toBeDisabled();
  });

  it("blocks reinstatement when fresh availability changes while its dialog is open", async () => {
    records = [{ ...suggestion(), status: "withdrawn", bidEligible: false, reinstatementAvailability: { available: true, reason: null } }];
    mount();
    const row = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    await waitFor(() => expect(within(row).getByRole("button", { name: "Reinstate" })).toBeEnabled());
    await userEvent.click(within(row).getByRole("button", { name: "Reinstate" }));
    const dialog = await screen.findByRole("dialog", { name: "Reinstate suggestion" });
    expect(within(dialog).getByRole("button", { name: "Reinstate suggestion" })).toBeEnabled();
    records[0]!.reinstatementAvailability = { available: false, reason: "Vendor is no longer linked to this Main Line in Configuration." };
    await act(async () => { await client.refetchQueries({ queryKey: pmEstimateKeys.all }); });
    expect(await within(dialog).findByText("Vendor is no longer linked to this Main Line in Configuration.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Reinstate suggestion" })).toBeDisabled();
    expect(updates).toEqual([]);
  });

  it("does not guess reinstatement availability from an older response", async () => {
    records = [{ ...suggestion(), status: "withdrawn", reinstatementAvailability: undefined }];
    mount();
    const row = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    expect(within(row).getByRole("button", { name: "Reinstate" })).toBeDisabled();
    await userEvent.click(within(row).getByText("Suggestion details"));
    expect(within(row).getByText("Refresh suggestion details before reinstating.")).toBeVisible();
    await waitFor(() => expect(within(row).getByRole("button", { name: "Edit note" })).toBeEnabled());
  });

  it("renders immutable scope, exact paise, zero and unavailable rates without editor actions", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Cedar residence" })).toBeVisible();
    expect(screen.getByText("Approved final estimate · Version 3")).toBeVisible();
    expect(screen.getByText("Read only")).toBeVisible();
    const summary = screen.getByRole("region", { name: "Approved commercial summary" });
    expect(summary).toHaveTextContent("₹496.90"); expect(summary).toHaveTextContent("₹89.44"); expect(summary).toHaveTextContent("₹586.34");
    const living = screen.getByRole("table", { name: "Approved scope for Living room, Carpentry" });
    expect(living).toHaveTextContent("₹123.45");
    await userEvent.click(within(living).getByText("Specification & dimensions"));
    expect(within(living).getByText("2.050 ft")).toBeVisible();
    expect(screen.getByRole("table", { name: "Approved scope for Bedroom, Carpentry" })).toHaveTextContent("Unavailable");
    expect(screen.getByRole("table", { name: "Approved scope for Bedroom, Carpentry" })).toHaveTextContent("₹0");
    expect(screen.getByRole("button", { name: "Suggest vendor for Excluded console in Living room" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /approve|publish|reprice|save estimate/i })).not.toBeInTheDocument();
  });

  it("keeps approved pre-estimate and unavailable sources explicit", async () => {
    view.source!.phase = "pre";
    view.totals.gstPaise = null;
    mount();
    expect(await screen.findByText("Approved pre-estimate · Version 3")).toBeVisible();
    expect(screen.getByRole("region", { name: "Approved commercial summary" })).toHaveTextContent("GSTUnavailable");
    view = { ...view, availability: "unavailable", reason: "Approval source needs reconciliation.", source: null, lines: [], mainLines: [], writeAvailability: { available: false, reason: "No verified approved source." } };
    await userEvent.click(screen.getByRole("button", { name: "Refresh protected queries" }));
    expect(await screen.findByText("Approval source needs reconciliation.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Approved commercial summary" })).not.toBeInTheDocument();
  });

  it("preserves the project tab and dashboard filters in the return link", async () => {
    const projectReturn = "/projects/project-a/execution?tab=procurement&returnTo=%2Fexecution%3Fview%3Dgrid%26q%3DCedar";
    mount(`/projects/project-a/estimations?${new URLSearchParams({ returnTo: projectReturn })}`);
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", projectReturn);
    await screen.findByRole("heading", { name: "Cedar residence" });
  });

  it.each(["https://outside.test", "//outside.test", "/projects/project-b/execution", "/projects/project-a/%2e%2e/execution"])("rejects an invalid project return target %s", candidate => {
    expect(pmEstimateReturnPath("project-a", candidate)).toBe("/projects/project-a/execution");
  });

  it("saves the exact Main Line, approved source and note, then shows the persisted suggestion", async () => {
    mount();
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByText("Included room scope (2)"));
    expect(within(dialog).getByText("Living room")).toBeVisible(); expect(within(dialog).getByText("Bedroom")).toBeVisible();
    const radio = await within(dialog).findByRole("radio", { name: /Oak Works/ });
    expect(within(dialog).getByRole("radio", { name: /Inactive Works/ })).toBeDisabled();
    await userEvent.click(radio);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Experienced with this approved timber scope.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    expect(await screen.findByText("Suggestion saved for Procurement to review.")).toBeVisible();
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ expectedSource: source, mainLineId: "main-line-one", vendorId: "vendor-one", note: "Experienced with this approved timber scope." });
    expect(creates[0]!.idempotencyKey).toHaveLength(36);
    const record = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    expect(record).toHaveTextContent("No matching bid request");
    expect(record).not.toHaveTextContent("bid sent");
    await userEvent.click(within(record).getByText("Suggestion details"));
    await userEvent.click(within(record).getByText("Suggestion note"));
    expect(within(record).getByText("Experienced with this approved timber scope.")).toBeVisible();
  });

  it("lets the same saved vendor be suggested independently for a second Main Line", async () => {
    records = [suggestion()];
    mount();
    const dialog = await openCreate("Wardrobe", "Bedroom");
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    await screen.findByText("Suggestion saved for Procurement to review.");
    expect(creates[0]!.mainLineId).toBe("main-line-two");
    expect(await screen.findByRole("article", { name: "Oak Works for Oak panelling" })).toBeVisible();
    expect(await screen.findByRole("article", { name: "Oak Works for Wardrobe" })).toBeVisible();
  });

  it("suggests a vendor for an approved temporary item with its saved identity and amounts intact", async () => {
    view.lines[2]!.itemType = "temporary";
    view.mainLines[1]!.itemType = "temporary";
    mount();
    const trigger = await screen.findByRole("button", { name: "Suggest vendor for Wardrobe in Bedroom" });
    const row = trigger.closest("tr")!;
    expect(within(row).getByText("Temporary item")).toBeVisible();
    expect(row).toHaveTextContent("₹250");
    expect(within(row).queryByText(/mapping required/i)).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toBeEnabled());
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Suggest a vendor" });
    expect(within(dialog).getByRole("option", { name: "Wardrobe · Temporary item" })).toHaveValue("main-line-two");
    expect(within(dialog).getByRole("heading", { name: "Wardrobe" })).toBeVisible();
    expect(within(dialog).getByText("Temporary item")).toBeVisible();
    await userEvent.click(within(dialog).getByText("Included room scope (1)"));
    expect(within(dialog).getByText("Bedroom")).toBeVisible();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    await screen.findByText("Suggestion saved for Procurement to review.");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ expectedSource: source, mainLineId: "main-line-two", vendorId: "vendor-one" });
    const record = await screen.findByRole("article", { name: "Oak Works for Wardrobe" });
    expect(within(record).getByText("Temporary item")).toBeVisible();
    expect(records[0]!.mainLine?.itemType).toBe("temporary");
    expect(screen.getByRole("region", { name: "Approved commercial summary" })).toHaveTextContent("₹586.34");
    expect(view.lines[2]).toMatchObject({ itemType: "temporary", quantity: 1, ratePaise: 25000, amountPaise: 25000 });
  });

  it.each(["configuration", "database", "excluded", "unmapped"] as const)("keeps a temporary suggestion disabled when %s readiness is missing", async blocker => {
    view.lines[2]!.itemType = "temporary";
    view.mainLines[1]!.itemType = "temporary";
    if (blocker === "configuration") {
      view.mainLines[1]!.canSuggest = false;
      view.mainLines[1]!.unavailableReason = "Current item Configuration needs review.";
    } else if (blocker === "database") {
      view.writeAvailability = { available: false, reason: "Vendor suggestions are temporarily unavailable." };
    } else {
      view.mainLines.pop();
      if (blocker === "excluded") view.lines[2]!.included = false;
      else view.lines[2]!.mainLineId = null;
    }
    mount();
    const trigger = await screen.findByRole("button", { name: "Suggest vendor for Wardrobe in Bedroom" });
    expect(trigger).toBeDisabled();
    const row = trigger.closest("tr")!;
    expect(within(row).getByText("Temporary item")).toBeVisible();
    if (blocker === "configuration") expect(row).toHaveTextContent("Current item Configuration needs review.");
    if (blocker === "excluded") expect(row).toHaveTextContent("Excluded scope");
    if (blocker === "unmapped") expect(row).toHaveTextContent("Approved item mapping required");
    await userEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(creates).toHaveLength(0);
  });

  it("returns keyboard focus to the exact estimate row after deferred editor opening", async () => {
    server.use(http.get("/api/v1/projects/project-a/pm/vendor-suggestions", async () => {
      await delay(100);
      return HttpResponse.json({ data: { source: view.source, items: [], total: 0, limit: 20, offset: 0, writeAvailability: view.writeAvailability } });
    }));
    mount();
    for (const name of ["Suggest vendor for Oak panelling in Living room", "Suggest vendor for Wardrobe in Bedroom"]) {
      const trigger = await screen.findByRole("button", { name });
      await waitFor(() => expect(trigger).toBeEnabled());
      await act(async () => { await client.invalidateQueries({ queryKey: pmEstimateKeys.all, predicate: query => query.queryKey.includes("suggestions"), refetchType: "none" }); });
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      expect(screen.queryByRole("dialog", { name: "Suggest a vendor" })).not.toBeInTheDocument();
      // A browser can clear focus while the trigger is disabled during the opening refresh.
      // The dialog must retain the initiating row even when it mounts after that focus loss.
      trigger.blur();
      const dialog = await screen.findByRole("dialog", { name: "Suggest a vendor" });
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Suggest a vendor" })).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    }
    const panelTrigger = screen.getByRole("button", { name: "Suggest vendor" });
    panelTrigger.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Suggest a vendor" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(panelTrigger).toHaveFocus());
  });

  it("keeps a typed note through a source conflict and requires review of the new scope", async () => {
    let attempts = 0;
    server.use(http.post("/api/v1/projects/project-a/pm/vendor-suggestions", async ({ request }) => {
      const body = await request.json() as PMVendorSuggestionCreate; creates.push(body); attempts += 1;
      if (attempts === 1) {
        view.source = { ...source, estimateVersion: 4, estimateReviewRoundId: "round-new", sourceSnapshotId: "round-new", sourceDigest: "b".repeat(64) };
        return HttpResponse.json({ error: { code: "SOURCE_CONFLICT", message: "The approved source changed." } }, { status: 409 });
      }
      return HttpResponse.json({ data: { id: "new-suggestion", version: 1, status: "suggested" } }, { status: 201 });
    }));
    mount();
    const dialog = await openCreate();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep this unsaved note.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    expect(await within(dialog).findByText("The approved source changed. Your note is preserved.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep this unsaved note.");
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Review current scope" }));
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    await screen.findByText("Suggestion saved for Procurement to review.");
    expect(creates[1]).toMatchObject({ expectedSource: { estimateVersion: 4, estimateReviewRoundId: "round-new" }, note: "Keep this unsaved note." });
    expect(creates[1]!.idempotencyKey).not.toBe(creates[0]!.idempotencyKey);
  });

  it("edits, withdraws and reinstates an owned suggestion with current CAS versions", async () => {
    records = [suggestion()]; mount();
    const record = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    await waitFor(() => expect(within(record).getByRole("button", { name: "Edit note" })).toBeEnabled());
    await userEvent.click(within(record).getByRole("button", { name: "Edit note" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit suggestion note" });
    await userEvent.clear(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Updated suitability.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    await screen.findByText("Suggestion note updated.");
    expect(updates[0]).toMatchObject({ expectedVersion: 1, note: "Updated suitability.", status: "suggested" });
    await userEvent.click(within(record).getByRole("button", { name: "Withdraw" }));
    dialog = await screen.findByRole("dialog", { name: "Withdraw suggestion" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw suggestion" }));
    await screen.findByText("Suggestion withdrawn. Existing bid requests are unchanged.");
    expect(updates[1]).toMatchObject({ expectedVersion: 2, status: "withdrawn" });
    await userEvent.click(within(record).getByRole("button", { name: "Reinstate" }));
    dialog = await screen.findByRole("dialog", { name: "Reinstate suggestion" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Reinstate suggestion" }));
    await screen.findByText("Suggestion reinstated for Procurement to review.");
    expect(updates[2]).toMatchObject({ expectedVersion: 3, status: "suggested" });
  });

  it("preserves a concurrent withdrawal when reviewing a conflict and saving only the note", async () => {
    records = [suggestion()];
    server.use(http.patch("/api/v1/projects/project-a/pm/vendor-suggestions/:suggestionId", async ({ request }) => {
      const body = await request.json() as PMVendorSuggestionUpdate;
      updates.push(body);
      const record = records[0]!;
      if (updates.length === 1) {
        record.status = "withdrawn";
        record.version = 2;
        record.reinstatementAvailability = { available: true, reason: null };
        return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "This suggestion changed. Refresh and review it before saving." } }, { status: 409 });
      }
      record.note = body.note;
      record.status = body.status;
      record.version += 1;
      return HttpResponse.json({ data: { id: record.id, version: record.version, status: record.status } });
    }));
    mount();
    const record = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    await waitFor(() => expect(within(record).getByRole("button", { name: "Edit note" })).toBeEnabled());
    await userEvent.click(within(record).getByRole("button", { name: "Edit note" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit suggestion note" });
    const note = within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" });
    await userEvent.clear(note);
    await userEvent.type(note, "Retain this note after the other session withdraws.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    expect(await within(dialog).findByText("This suggestion changed. Your note is preserved.")).toBeVisible();
    expect(within(dialog).getByText("Current status: Withdrawn")).toBeVisible();
    expect(note).toHaveValue("Retain this note after the other session withdraws.");
    expect(within(dialog).getByRole("button", { name: "Save note" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Review current scope" }));
    expect(within(dialog).getByText("Suggestion status: Withdrawn")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save note" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    await screen.findByText("Suggestion note updated.");
    expect(updates[1]).toMatchObject({ expectedVersion: 2, status: "withdrawn", note: "Retain this note after the other session withdraws." });
    expect(updates[1]!.idempotencyKey).not.toBe(updates[0]!.idempotencyKey);
    expect(within(record).getByRole("button", { name: "Reinstate" })).toBeEnabled();
    expect(within(record).queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });

  it("identifies an existing duplicate author without offering to take over the record", async () => {
    records = [{ ...suggestion(), suggestedBy: { id: "pm-b", name: "Previous Manager" }, canEdit: false, editUnavailableReason: "Only the author can edit this suggestion." }];
    server.use(http.post("/api/v1/projects/project-a/pm/vendor-suggestions", () => HttpResponse.json({ error: {
      code: "VENDOR_SUGGESTION_DUPLICATE", message: "This vendor is already suggested for this Main Line. Review the existing suggestion.",
      fields: { suggestionId: "suggestion-one", suggestedBy: "Previous Manager", suggestedById: "pm-b" }
    } }, { status: 409 })));
    mount();
    const dialog = await openCreate();
    await userEvent.click(await within(dialog).findByRole("radio", { name: /Oak Works/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" }), "Keep my draft note.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suggest to Procurement" }));
    expect(await within(dialog).findByText("Suggested by Previous Manager.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Suggestion note (optional)" })).toHaveValue("Keep my draft note.");
    expect(within(dialog).getByRole("button", { name: "Suggest to Procurement" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Review current scope" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Review saved suggestions" }));
    const saved = screen.getByRole("article", { name: "Oak Works for Oak panelling" });
    expect(within(saved).queryByRole("button", { name: "Edit note" })).not.toBeInTheDocument();
  });

  it("shows other-author history and actual partial activity without editable or invented receipt state", async () => {
    records = [{ ...suggestion(), canEdit: false, editUnavailableReason: "Only the author can edit this suggestion.", suggestedBy: { id: "pm-b", name: "Previous Manager" }, sourceState: "historical", activity: { availability: "available", truncated: true, items: [
      { enquiryId: "enquiry-a", basketId: "basket-one", revisionId: "revision-a", revision: 2, invitationId: "invite-a", requestedAt: "2026-10-24T10:00:00Z", deliveryStatus: "failed", deliveredAt: null, bidReceivedAt: null, lineResponded: false, respondedSourceLineItemKeys: [], coveredSourceLineItemKeys: ["scope-one"], coverage: "partial", sourceRelation: "exact" }
    ] } }]; mount();
    const record = await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    expect(within(record).queryByRole("button", { name: "Edit note" })).not.toBeInTheDocument();
    await userEvent.click(within(record).getByText("Suggestion details"));
    await userEvent.click(within(record).getByText("Bid activity for this Main Line and vendor (1)"));
    expect(record).toHaveTextContent("Partial approved room scope requested");
    expect(record).toHaveTextContent("This request predates the suggestion.");
    expect(record).toHaveTextContent("Earlier records remain in Procurement history");
    expect(record).not.toHaveTextContent("Basket bid received");
    expect(record).not.toHaveTextContent("No matching bid request");
  });

  it("removes protected data after a cached-success assignment denial", async () => {
    records = [suggestion()]; mount();
    await screen.findByRole("heading", { name: "Cedar residence" });
    await screen.findByRole("article", { name: "Oak Works for Oak panelling" });
    server.use(http.get("/api/v1/projects/project-a/pm/estimate", () => HttpResponse.json({ error: { code: "PM_NOT_FOUND", message: "Not available." } }, { status: 404 })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh protected queries" }));
    await screen.findByRole("heading", { name: "Project access unavailable" });
    expect(screen.queryByRole("heading", { name: "Cedar residence" })).not.toBeInTheDocument();
    expect(screen.queryByText("Oak Works")).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: pmEstimateKeys.project("pm-a", "project-a") }).every(query => query.state.data === undefined)).toBe(true));
  });

  it("keeps loading visible while approved data is pending", async () => {
    server.use(http.get("/api/v1/projects/project-a/pm/estimate", async () => { await delay(80); return HttpResponse.json({ data: view }); }));
    mount(); expect(screen.getByText("Loading workspace…")).toHaveAttribute("role", "status");
    await screen.findByRole("heading", { name: "Cedar residence" });
  });

  it("rejects an estimate response for a different project", async () => {
    view.project = { id: "project-b", name: "Other private project" };
    mount();
    expect(await screen.findByText("The estimate does not match this project. Refresh your assigned project.", {}, { timeout: 3000 })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Other private project" })).not.toBeInTheDocument();
  });
});

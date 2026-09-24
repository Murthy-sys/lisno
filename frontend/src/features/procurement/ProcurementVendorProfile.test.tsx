import axe from "axe-core";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError } from "../../api/client";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { ProcurementVendorDetail, ProcurementVendorProfile } from "../ai-estimator-knowledge/knowledgeTypes";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import { ProcurementVendorEditor } from "./ProcurementVendorEditor";
import { completeVendor, completeVendorProfile, vendorBasket, vendorMetadata, vendorSubBasket } from "./vendorProfile.fixtures";
import { VENDOR_TEXT_FIELDS } from "./vendorProfileDraft";

const response = (value: unknown, status = 200) => HttpResponse.json({ data: value }, { status });
const page = (items: unknown[], offset = 0, hasMore = false) => response({ items, pagination: { total: items.length + offset, limit: 100, offset, hasMore } });
const safe = (vendor: ProcurementVendorDetail) => { const { procurementProfile, geoTaggedPicture, ...summary } = vendor; return summary; };
let stored: ProcurementVendorDetail;
let writes: Record<string, unknown>[];
function start(existing = true, canCreateBasket = true, canUpdate = true) {
  const closed = vi.fn(); const saved = vi.fn(); let client!: QueryClient;
  function Capture() { client = useQueryClient(); return <ProcurementVendorEditor existing={existing ? safe(stored) : undefined} canCreateBasket={canCreateBasket} canUpdate={canUpdate} onClose={closed} onSaved={saved} />; }
  const view = renderWithQuery(<Capture />);
  return { ...view, closed, saved, get client() { return client; } };
}
async function answer(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(within(screen.getByRole("group", { name: new RegExp(`^${label}`) })).getByRole("radio", { name: option }));
}
async function fillNew(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByRole("textbox", { name: "Entity Name" }), { target: { value: "New Synthetic Vendor" } });
  for (const [key, label] of Object.entries(VENDOR_TEXT_FIELDS)) fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: completeVendorProfile[key as keyof ProcurementVendorProfile] } });
  await answer(user, "Vendor Type", "Execution"); await user.click(screen.getByRole("checkbox", { name: "Labor" }));
  await answer(user, "GST Registered", "No"); await answer(user, "MSME Registered", "Yes"); await answer(user, "Current Address Verified Physically", "No");
  fireEvent.change(screen.getByRole("textbox", { name: "Turnover (Self Declared) (INR)" }), { target: { value: "100000" } });
  await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), vendorBasket.id);
  await screen.findByRole("option", { name: vendorSubBasket.name });
  await user.selectOptions(screen.getByRole("combobox", { name: "Sub Basket" }), vendorSubBasket.id);
}
beforeEach(() => {
  stored = structuredClone(completeVendor); writes = [];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:synthetic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  server.use(
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => page([vendorBasket])),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", ({ params }) => page(params.basketId === vendorBasket.id ? [vendorSubBasket] : [])),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => response(stored)),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors", () => page([safe(stored)])),
    http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, name: input.name as string, status: input.status as "active", version: stored.version + 1, procurementProfile: { ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      return response(safe(stored));
    }),
    http.post("/api/v1/admin/ai-estimator-knowledge/vendors", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, id: "vendor-created", name: input.name as string, procurementProfile: { ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      return response(safe(stored), 201);
    })
  );
});
describe("Procurement vendor profile", () => {
  it.each(["labor", "material_labour", "both", "supplier_yes", "supplier_no"])("saves and reloads %s with exact conditional fields", async (branch) => {
    const view = start(); const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "Entity Name" });
    if (branch.startsWith("supplier")) { await answer(user, "Vendor Type", "Supplier"); await answer(user, "Supplier", branch.endsWith("yes") ? "Yes" : "No"); }
    else {
      for (const [value, label] of [["labor", "Labor"], ["material_labour", "Material + Labour"]]) {
        const checkbox = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
        if (checkbox.checked !== (branch === "both" || branch === value)) await user.click(checkbox);
      }
    }
    expect(screen.getByRole("textbox", { name: "Turnover (Verified) (INR)" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ expectedVersion: 1, procurementProfile: {
      vendorType: branch.startsWith("supplier") ? "supplier" : "execution", executionType: branch.startsWith("supplier") ? null : branch === "both" ? ["labor", "material_labour"] : [branch],
      supplier: branch.startsWith("supplier") ? branch.endsWith("yes") : null, turnoverVerifiedPaise: null, turnoverSelfDeclaredPaise: 10000000
    } });
    view.unmount(); start(); await screen.findByRole("textbox", { name: "Entity Name" });
    if (branch.startsWith("supplier")) {
      expect(screen.getByRole("radio", { name: "Supplier" })).toBeChecked();
      expect(within(screen.getByRole("group", { name: /^Supplier/ })).getByRole("radio", { name: branch.endsWith("yes") ? "Yes" : "No" })).toBeChecked();
      expect(screen.queryByRole("checkbox", { name: "Labor" })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole("checkbox", { name: "Labor" })).toHaveProperty("checked", branch === "labor" || branch === "both");
      expect(screen.getByRole("checkbox", { name: "Material + Labour" })).toHaveProperty("checked", branch === "material_labour" || branch === "both");
    }
  });
  it("supports independent keyboard choices and requires at least one with an associated error and focus", async () => {
    start(); const user = userEvent.setup();
    const labor = await screen.findByRole("checkbox", { name: "Labor" });
    const material = screen.getByRole("checkbox", { name: "Material + Labour" });
    expect(labor).not.toBeRequired(); expect(material).not.toBeRequired();
    labor.focus(); await user.tab(); expect(material).toHaveFocus(); await user.keyboard(" ");
    expect(labor).toBeChecked(); expect(material).toBeChecked();
    await user.tab({ shift: true }); expect(labor).toHaveFocus(); await user.keyboard(" ");
    expect(labor).not.toBeChecked(); expect(material).toBeChecked();
    await user.tab(); await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(labor).toHaveFocus());
    expect(labor).toHaveAttribute("aria-invalid", "true");
    expect(labor).toHaveAccessibleDescription(/Choose at least one Execution Type/);
    expect(material).toHaveAccessibleDescription(/Choose at least one Execution Type/);
    expect(screen.getByRole("group", { name: /^Execution Type/ })).toHaveAccessibleDescription(/Choose at least one Execution Type/);
    expect(writes).toHaveLength(0);
    await user.keyboard(" ");
    expect(labor).toBeChecked(); expect(material).not.toBeChecked();
    expect(screen.queryByText("Choose at least one Execution Type.")).not.toBeInTheDocument();
  });
  it("saves one remaining selection after independently unchecking the other", async () => {
    stored.procurementProfile!.executionType = ["labor", "material_labour"];
    const view = start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Labor" }));
    expect(screen.getByRole("checkbox", { name: "Material + Labour" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { executionType: ["material_labour"] } });
  });
  it("clears conditional choices when switching Vendor Type without losing other entries", async () => {
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" });
    await user.click(screen.getByRole("checkbox", { name: "Material + Labour" }));
    await answer(user, "Vendor Type", "Supplier"); await answer(user, "Supplier", "Yes");
    await answer(user, "Vendor Type", "Execution");
    expect(screen.getByRole("checkbox", { name: "Labor" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Material + Labour" })).not.toBeChecked();
    await answer(user, "Vendor Type", "Supplier");
    expect(within(screen.getByRole("group", { name: /^Supplier/ })).getByRole("radio", { name: "Yes" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: /^Supplier/ })).getByRole("radio", { name: "No" })).not.toBeChecked();
    await answer(user, "Supplier", "No"); await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ name: "Timber House", procurementProfile: { executionType: null, supplier: false, position: "Owner" } });
  });
  it.each(["labor", "material_labour"] as const)("displays legacy %s detail as a single checkbox and saves an array", async (legacy) => {
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => response({ ...stored, procurementProfile: { ...stored.procurementProfile, executionType: legacy } })));
    const view = start(); const user = userEvent.setup();
    expect(await screen.findByRole("checkbox", { name: legacy === "labor" ? "Labor" : "Material + Labour" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: legacy === "labor" ? "Material + Labour" : "Labor" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { executionType: [legacy] } });
  });
  it("validates required fields, focuses the first invalid radio and preserves dirty drafts", async () => {
    start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name });
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    expect(screen.getByText("Review the required fields and highlighted errors before saving.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Execution" })).toHaveFocus());
    fireEvent.change(screen.getByRole("textbox", { name: "Entity Name" }), { target: { value: "Preserved" } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Entity Name" })).toHaveValue("Preserved"); expect(writes).toHaveLength(0);
  });
  it("distinguishes zero verified turnover and requires address reconfirmation", async () => {
    stored.procurementProfile!.currentAddressVerifiedPhysically = true;
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" });
    fireEvent.change(screen.getByRole("textbox", { name: "Current Address" }), { target: { value: "Changed synthetic address" } });
    expect(within(screen.getByRole("group", { name: /^Current Address Verified Physically/ })).getByRole("radio", { name: "Yes" })).not.toBeChecked();
    await answer(user, "Current Address Verified Physically", "Yes");
    fireEvent.change(screen.getByRole("textbox", { name: "Turnover (Verified) (INR)" }), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalled());
    expect(writes[0]).toMatchObject({ confirmPhysicalAddressVerification: true, procurementProfile: { turnoverVerifiedPaise: 0, turnoverSelfDeclaredPaise: 10000000, currentAddressVerifiedPhysically: true } });
  });
  it("uses all basket pages and clears the child when the parent changes during a request", async () => {
    let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve; });
    const requests: number[] = [];
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset")); requests.push(offset);
      return offset === 0 ? page([vendorBasket], 0, true) : page([{ ...vendorBasket, id: "basket-two", name: "Stone" }], 1);
    }), http.get("/api/v1/admin/ai-estimator-knowledge/baskets/basket-two/sub-baskets", async () => { await pending; return page([{ ...vendorSubBasket, id: "stone-sub", basketId: "basket-two", name: "Stone installation" }]); }));
    start(); const user = userEvent.setup(); await screen.findByRole("option", { name: "Stone" }); expect(requests).toContain(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-two");
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(""); expect(screen.getByRole("combobox", { name: "Sub Basket" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), vendorBasket.id);
    await act(async () => release());
    expect(screen.queryByRole("option", { name: "Stone installation" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Entity Name" })).toHaveValue("Timber House");
  });
  it("reuses inline basket creation and immediately selects the shared identities", async () => {
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/baskets", async () => response({ ...vendorBasket, id: "basket-new", name: "Metal work" })),
      http.post("/api/v1/admin/ai-estimator-knowledge/baskets/basket-new/sub-baskets", () => response({ ...vendorSubBasket, id: "sub-new", basketId: "basket-new", name: "Rails" })));
    start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" });
    await user.click(screen.getByRole("button", { name: "Add Main Basket" }));
    await user.type(screen.getByRole("textbox", { name: "New Main Basket name" }), "Metal work");
    await user.click(within(screen.getByRole("group", { name: "Add Main Basket" })).getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Main Basket" })).toHaveValue("basket-new"));
    await user.click(screen.getByRole("button", { name: "Add Sub Basket" }));
    await user.type(screen.getByRole("textbox", { name: /New Sub.Basket name/ }), "Rails");
    await user.click(within(screen.getByRole("group", { name: /Add Sub.Basket/ })).getByRole("button", { name: "Save Sub-Basket" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue("sub-new"));
    expect(screen.getByRole("textbox", { name: "Entity Name" })).toHaveValue("Timber House");
  });
  it("retries failed picture attachment without recreating the vendor or changing retry identity", async () => {
    const uploads: { key: FormDataEntryValue | null; version: FormDataEntryValue | null; id: unknown }[] = [];
    vi.spyOn(apiClient, "putMultipart").mockImplementation(async (url, body) => {
      uploads.push({ key: body.get("idempotencyKey"), version: body.get("expectedVersion"), id: url.split("/").at(-2) });
      if (uploads.length === 1) throw new ApiError(503, "TEMPORARY", "Picture service unavailable");
      stored = { ...stored, version: stored.version + 1, geoTaggedPicture: { id: "photo-new", url: "/admin/ai-estimator-knowledge/vendors/vendor-created/photo?v=photo-new", mimeType: "image/png", byteSize: 4, uploadedAt: vendorMetadata.updatedAt } };
      return { vendorId: stored.id, version: stored.version, geoTaggedPicture: stored.geoTaggedPicture } as never;
    });
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-created/photo", () => new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } })));
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user);
    await user.upload(screen.getByLabelText("Geo Tagged Picture of the Vendor"), new File(["fake"], "synthetic.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    await screen.findByText(/Vendor saved, but the picture has not been confirmed/);
    expect(view.saved).not.toHaveBeenCalled(); expect(writes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry picture attachment" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes).toHaveLength(1); expect(uploads).toHaveLength(2); expect(uploads[0]).toEqual(uploads[1]); expect(uploads[1].id).toBe("vendor-created");
  });
  it("replaces a private photo and confirms a lost removal response by rereading the detail", async () => {
    stored.geoTaggedPicture = { id: "photo-old", url: "/admin/ai-estimator-knowledge/vendors/vendor-one/photo?v=photo-old", mimeType: "image/png", byteSize: 3, uploadedAt: vendorMetadata.updatedAt };
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one/photo", () => new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } })));
    const upload = vi.spyOn(apiClient, "putMultipart").mockImplementation(async () => {
      stored = { ...stored, version: stored.version + 1, geoTaggedPicture: { ...stored.geoTaggedPicture!, id: "photo-replacement", url: "/admin/ai-estimator-knowledge/vendors/vendor-one/photo?v=photo-replacement" } };
      return { vendorId: stored.id, version: stored.version, geoTaggedPicture: stored.geoTaggedPicture } as never;
    });
    const view = start(); const user = userEvent.setup(); await screen.findByRole("img", { name: "Saved vendor picture" });
    await user.upload(screen.getByLabelText("Geo Tagged Picture of the Vendor"), new File(["new"], "replacement.png", { type: "image/png" }));
    await screen.findByRole("img", { name: "Selected vendor picture preview" });
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce()); expect(upload).toHaveBeenCalledOnce();
    view.unmount(); const second = start(); const removals = vi.fn();
    server.use(http.delete("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one/photo", async ({ request }) => { removals(await request.json()); stored = { ...stored, version: stored.version + 1, geoTaggedPicture: null }; return HttpResponse.json({ error: { code: "TEMPORARY", message: "Removal response lost" } }, { status: 503 }); }));
    await screen.findByRole("img", { name: "Saved vendor picture" }); await user.click(screen.getByRole("button", { name: "Remove picture" }));
    await user.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText(/Removal response lost/);
    await user.click(screen.getByRole("button", { name: "Retry picture attachment" })); await waitFor(() => expect(second.saved).toHaveBeenCalledOnce()); expect(removals).toHaveBeenCalledOnce();
    expect(second.saved.mock.calls[0][0].geoTaggedPicture).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it("has accessible labels and field groups in the expanded panel", async () => {
    start(); await screen.findByRole("textbox", { name: "Entity Name" });
    const results = await axe.run(screen.getByRole("dialog", { name: "Vendor details" }), { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
  it.each(["single", "both"])("recovers a lost create response with equivalent %s arrays and keeps private detail out of shared caches", async (selection) => {
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/vendors", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, name: input.name as string, procurementProfile: { ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      stored.procurementProfile!.executionType = [...stored.procurementProfile!.executionType!].reverse();
      return HttpResponse.json({ error: { code: "TEMPORARY", message: "Response lost" } }, { status: 503 });
    }));
    const view = start(false); view.client.setQueryData(knowledgeQueryKeys.masterCatalog("vendors"), { items: [safe(stored)] });
    const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user);
    if (selection === "both") await user.click(screen.getByRole("checkbox", { name: "Material + Labour" }));
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce()); expect(writes).toHaveLength(1);
    const shared = view.client.getQueriesData({ queryKey: knowledgeQueryKeys.masterLists("vendors") });
    expect(JSON.stringify(shared)).not.toContain("aadhar"); expect(JSON.stringify(shared)).not.toContain("sample@example.test");
  });
  it.each(["execution selections", "another profile field"])("does not reconcile a lost create response when %s differ", async (difference) => {
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/vendors", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, name: input.name as string, procurementProfile: { ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      if (difference === "execution selections") stored.procurementProfile!.executionType = ["labor"];
      else stored.procurementProfile!.position = "Different position";
      return HttpResponse.json({ error: { code: "TEMPORARY", message: "Response lost" } }, { status: 503 });
    }));
    const view = start(false); const user = userEvent.setup();
    await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user);
    await user.click(screen.getByRole("checkbox", { name: "Material + Labour" }));
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    await screen.findByText(/An existing vendor uses this Entity Name with different details/);
    expect(view.saved).not.toHaveBeenCalled(); expect(view.closed).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Labor" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Material + Labour" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Check saved vendor" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check saved vendor" })).toBeEnabled());
    expect(view.saved).not.toHaveBeenCalled(); expect(writes).toHaveLength(1);
  });
  it("preserves a stale draft until deliberate reload and hides creation for read-only viewers", async () => {
    server.use(http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Vendor changed" } }, { status: 409 })));
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" });
    await user.click(screen.getByRole("checkbox", { name: "Material + Labour" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Position" }), { target: { value: "Draft position" } }); await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Vendor changed"); expect(screen.getByRole("textbox", { name: "Position" })).toHaveValue("Draft position"); expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Labor" })).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Material + Labour" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reload latest and replace entries" })); await waitFor(() => expect(screen.getByRole("textbox", { name: "Position" })).toHaveValue("Owner"));
    view.unmount(); start(true, false, false); await screen.findByRole("textbox", { name: "Entity Name" });
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Add Main Basket" })).not.toBeInTheDocument(); expect(screen.getByRole("textbox", { name: "AADHAR" })).toBeDisabled();
  });
});

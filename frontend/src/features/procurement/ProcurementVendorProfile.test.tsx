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
import { completeVendor, completeVendorProfile, sampleVendorBankAccount, vendorBasket, vendorMetadata, vendorSubBasket } from "./vendorProfile.fixtures";
import { VENDOR_BANK_FIELDS, VENDOR_TEXT_FIELDS, type VendorBankField } from "./vendorProfileDraft";

const response = (value: unknown, status = 200) => HttpResponse.json({ data: value }, { status });
const page = (items: unknown[], offset = 0, hasMore = false) => response({ items, pagination: { total: items.length + offset, limit: 100, offset, hasMore } });
const safe = (vendor: ProcurementVendorDetail) => { const { procurementProfile, geoTaggedPicture, msmeCertificate, ...summary } = vendor; return summary; };
const savedCertificate = { id: "certificate-one", originalFilename: "synthetic-msme.pdf", mimeType: "application/pdf" as const, byteSize: 4, uploadedAt: vendorMetadata.updatedAt, url: "/admin/ai-estimator-knowledge/vendors/vendor-one/msme-certificate?v=certificate-one" };
const stagedCertificate = { uploadId: "upload-one", originalFilename: "synthetic-msme.pdf", mimeType: "application/pdf", byteSize: 4, expiresAt: "2099-01-01T00:00:00Z" };
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
  await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Organization Type" }), "company");
  for (const [key, label] of Object.entries(VENDOR_TEXT_FIELDS)) fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: completeVendorProfile[key as keyof ProcurementVendorProfile] } });
  await answer(user, "Vendor Type", "Execution"); await user.click(screen.getByRole("checkbox", { name: "Labor" }));
  await answer(user, "GST Registered", "No"); await answer(user, "MSME Registered", "No"); await answer(user, "Current Address Verified Physically", "No");
  fireEvent.change(screen.getByRole("textbox", { name: "Turnover (Self Declared) (INR)" }), { target: { value: "100000" } });
  await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), vendorBasket.id);
  await screen.findByRole("option", { name: vendorSubBasket.name });
  await user.selectOptions(screen.getByRole("combobox", { name: "Sub Basket" }), vendorSubBasket.id);
}
function fillBank() {
  for (const [key, label] of Object.entries(VENDOR_BANK_FIELDS)) fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: sampleVendorBankAccount[key as VendorBankField] ?? "" } });
}
beforeEach(() => {
  stored = structuredClone(completeVendor); writes = [];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:synthetic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  server.use(
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => page([vendorBasket])),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", ({ params }) => page(params.basketId === vendorBasket.id ? [vendorSubBasket] : [])),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors/msme-certificate-upload-policy", () => response({ maxUploadBytes: 1048576, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], uploadLifetimeSeconds: 3600 })),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => response(stored)),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors", () => page([safe(stored)])),
    http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, name: input.name as string, status: input.status as "active", version: stored.version + 1, procurementProfile: { ...stored.procurementProfile, ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      stored.msmeCertificate = stored.procurementProfile?.msmeRegistered ? input.msmeCertificateUploadId ? { ...savedCertificate, id: "certificate-new" } : stored.msmeCertificate : null;
      return response(safe(stored));
    }),
    http.post("/api/v1/admin/ai-estimator-knowledge/vendors", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, id: "vendor-created", name: input.name as string, procurementProfile: { ...stored.procurementProfile, ...input.procurementProfile as ProcurementVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
      stored.msmeCertificate = stored.procurementProfile?.msmeRegistered ? { ...savedCertificate, id: "certificate-created", url: "/admin/ai-estimator-knowledge/vendors/vendor-created/msme-certificate?v=certificate-created" } : null;
      return response(safe(stored), 201);
    })
  );
});
describe("Procurement vendor profile", () => {
  it("shows the supplied organization options in order, requires a new selection, and allows empty bank details", async () => {
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name });
    const organization = screen.getByRole("combobox", { name: "Vendor Organization Type" });
    expect(organization).toHaveValue(""); expect(organization).toBeRequired();
    expect(within(organization).getAllByRole("option").map((option) => option.textContent)).toEqual(["Select organization type", "Individual", "Company", "Firm", "Associated Person", "HUF", "Trust", "GOVT"]);
    expect(within(screen.getByRole("region", { name: "Vendor Information" })).getByRole("combobox", { name: "Vendor Organization Type" })).toBe(organization);
    const bank = screen.getByRole("region", { name: "Bank Account Details" });
    for (const input of within(bank).getAllByRole("textbox")) expect(input).not.toBeRequired();
    await fillNew(user); await user.selectOptions(organization, "");
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    await waitFor(() => expect(organization).toHaveFocus()); expect(organization).toHaveAccessibleDescription("Choose a Vendor Organization Type."); expect(writes).toHaveLength(0);
    await user.selectOptions(organization, "associated_person"); expect(organization).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { organizationType: "associated_person", bankAccount: null } });
  });

  it.each(["execution", "supplier"])("creates, reloads, edits and clears normalized banking for %s vendors", async (vendorType) => {
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user);
    if (vendorType === "supplier") await answer(user, "Vendor Type", "Supplier");
    fillBank();
    const account = screen.getByRole("textbox", { name: "Account Number" }); expect(account).toHaveAttribute("type", "text"); expect(account).toHaveAttribute("inputmode", "numeric"); expect(account).toHaveAttribute("maxlength", "34");
    fireEvent.change(screen.getByRole("textbox", { name: "IFSC Code" }), { target: { value: "demo0123456" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Account Holder Name" }), { target: { value: "  Synthetic Account Holder  " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Branch Name" }), { target: { value: "  " } });
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { vendorType, organizationType: "company", bankAccount: { ...sampleVendorBankAccount, branchName: null } } });
    view.unmount(); const edited = start(); expect(await screen.findByRole("textbox", { name: "Account Number" })).toHaveValue(sampleVendorBankAccount.accountNumber);
    expect(screen.getByRole("textbox", { name: "IFSC Code" })).toHaveValue("DEMO0123456"); expect(screen.getByRole("textbox", { name: "Branch Name" })).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Organization Type" }), "trust");
    fireEvent.change(screen.getByRole("textbox", { name: "Account Number" }), { target: { value: "0000000987" } });
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(edited.saved).toHaveBeenCalledOnce());
    expect(writes[1]).toMatchObject({ expectedVersion: stored.version - 1, procurementProfile: { organizationType: "trust", bankAccount: { accountNumber: "0000000987" } } });
    edited.unmount(); const cleared = start(); await screen.findByRole("textbox", { name: "Account Number" });
    for (const label of Object.values(VENDOR_BANK_FIELDS)) fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: "" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Organization Type" }), "");
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(cleared.saved).toHaveBeenCalledOnce());
    expect(writes[2]).toMatchObject({ procurementProfile: { organizationType: null, bankAccount: null } });
    cleared.unmount(); start(); expect(await screen.findByRole("textbox", { name: "Account Number" })).toHaveValue("");
  });

  it("links partial bank errors, focuses the first missing field, and clears errors when the optional section is emptied", async () => {
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Account Number" });
    const branch = screen.getByRole("textbox", { name: "Branch Name" });
    fireEvent.change(branch, { target: { value: "Synthetic Branch" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Account Holder Name" })).toHaveFocus());
    for (const label of ["Account Holder Name", "Bank Name", "Account Number", "IFSC Code"]) {
      const input = screen.getByRole("textbox", { name: label }); expect(input).toBeRequired(); expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAccessibleDescription(/Enter/);
    }
    expect(branch).not.toBeRequired(); expect(writes).toHaveLength(0);
    fireEvent.change(branch, { target: { value: "" } });
    for (const input of within(screen.getByRole("region", { name: "Bank Account Details" })).getAllByRole("textbox")) { expect(input).not.toHaveAttribute("aria-invalid"); expect(input).not.toBeRequired(); }
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { bankAccount: null } });
  });

  it("maps nested server bank errors and clears only the corrected field", async () => {
    server.use(http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "Review bank details", fields: { "procurementProfile.bankAccount.accountNumber": "Check the account number.", "procurementProfile.bankAccount.ifscCode": "Check the IFSC code." } } }, { status: 400 })));
    start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Account Number" }); fillBank();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const account = screen.getByRole("textbox", { name: "Account Number" }); await waitFor(() => expect(account).toHaveFocus()); expect(account).toHaveAccessibleDescription("Check the account number.");
    fireEvent.change(account, { target: { value: "000456" } }); expect(account).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("textbox", { name: "IFSC Code" })).toHaveAccessibleDescription("Check the IFSC code.");
    fireEvent.change(screen.getByRole("textbox", { name: "IFSC Code" }), { target: { value: "ABCD0123456" } }); expect(screen.queryByText("Check the IFSC code.")).not.toBeInTheDocument();
  });

  it("allows editing a legacy profile missing organization and banking fields", async () => {
    const { organizationType, bankAccount, ...legacy } = stored.procurementProfile!;
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => response({ ...stored, procurementProfile: legacy })));
    const view = start(); const user = userEvent.setup(); const organization = await screen.findByRole("combobox", { name: "Vendor Organization Type" });
    expect(organization).toHaveValue(""); expect(organization).not.toBeRequired(); expect(screen.getByRole("textbox", { name: "Account Number" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { organizationType: null, bankAccount: null } });
  });

  it.each(["readonly", "archived"])("keeps stored organization and banking disabled for %s details", async (state) => {
    stored.procurementProfile!.bankAccount = { ...sampleVendorBankAccount }; if (state === "archived") stored = { ...stored, status: "archived" };
    start(true, false, state !== "readonly");
    const organization = await screen.findByRole("combobox", { name: "Vendor Organization Type" }); expect(organization).toBeDisabled(); expect(organization).toHaveValue("company");
    for (const label of Object.values(VENDOR_BANK_FIELDS)) expect(screen.getByRole("textbox", { name: label })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Account Number" })).toHaveValue(sampleVendorBankAccount.accountNumber); expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("preserves organization and bank drafts across cancel and conflict until a deliberate reload", async () => {
    stored.procurementProfile!.bankAccount = { ...sampleVendorBankAccount };
    server.use(http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", () => HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Vendor changed" } }, { status: 409 })));
    start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Account Number" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Organization Type" }), "govt");
    fireEvent.change(screen.getByRole("textbox", { name: "Account Number" }), { target: { value: "0000000999" } });
    await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Account Number" })).toHaveValue("0000000999");
    await user.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText("Vendor changed");
    expect(screen.getByRole("textbox", { name: "Account Number" })).toHaveValue("0000000999"); expect(screen.getByRole("combobox", { name: "Vendor Organization Type" })).toHaveValue("govt");
    expect(screen.getByRole("textbox", { name: "Account Number" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload latest and replace entries" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Account Number" })).toHaveValue(sampleVendorBankAccount.accountNumber)); expect(screen.getByRole("combobox", { name: "Vendor Organization Type" })).toHaveValue("company");
  });

  it.each(["labor", "material_labour", "both", "supplier"])("saves and reloads %s with exact conditional fields", async (branch) => {
    const view = start(); const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "Entity Name" });
    if (branch.startsWith("supplier")) { await answer(user, "Vendor Type", "Supplier"); }
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
      supplier: branch.startsWith("supplier") ? true : null, turnoverVerifiedPaise: null, turnoverSelfDeclaredPaise: 10000000
    } });
    view.unmount(); start(); await screen.findByRole("textbox", { name: "Entity Name" });
    if (branch.startsWith("supplier")) {
      expect(screen.getByRole("radio", { name: "Supplier" })).toBeChecked();
      expect(screen.queryByRole("group", { name: /^Supplier/ })).not.toBeInTheDocument();
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
    await answer(user, "Vendor Type", "Supplier");
    await answer(user, "Vendor Type", "Execution");
    expect(screen.getByRole("checkbox", { name: "Labor" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Material + Labour" })).not.toBeChecked();
    await answer(user, "Vendor Type", "Supplier");
    expect(screen.queryByRole("group", { name: /^Supplier/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ name: "Timber House", procurementProfile: { executionType: null, supplier: true, position: "Owner" } });
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
  it.each([false, true])("replays an uncertain save with the exact command and keeps private detail out of shared caches (existing %s)", async (existing) => {
    const handler = async ({ request }: { request: Request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, id: existing ? stored.id : "vendor-created", name: input.name as string, procurementProfile: { ...stored.procurementProfile!, ...input.procurementProfile as ProcurementVendorProfile } };
      return writes.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Response lost" } }, { status: 503 }) : response(safe(stored));
    };
    server.use(existing ? http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", handler) : http.post("/api/v1/admin/ai-estimator-knowledge/vendors", handler));
    const view = start(existing); view.client.setQueryData(knowledgeQueryKeys.masterCatalog("vendors"), { items: [safe(stored)] });
    const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name });
    if (!existing) await fillNew(user);
    fillBank();
    await user.click(screen.getByRole("button", { name: existing ? "Save changes" : "Save vendor" }));
    await screen.findByRole("button", { name: "Retry vendor save" });
    expect(view.saved).not.toHaveBeenCalled(); expect(screen.getByRole("textbox", { name: "Entity Name" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Account Number" })).toBeDisabled(); expect(screen.getByRole("combobox", { name: "Vendor Organization Type" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry vendor save" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); expect(writes[0].idempotencyKey).toEqual(expect.any(String));
    const shared = view.client.getQueriesData({ queryKey: knowledgeQueryKeys.masterLists("vendors") });
    expect(JSON.stringify(shared)).not.toContain("aadhar"); expect(JSON.stringify(shared)).not.toContain("sample@example.test"); expect(JSON.stringify(shared)).not.toContain("msmeCertificate");
    expect(JSON.stringify(shared)).not.toContain("bankAccount"); expect(JSON.stringify(shared)).not.toContain(sampleVendorBankAccount.accountNumber); expect(JSON.stringify(shared)).not.toContain(sampleVendorBankAccount.accountHolderName);
    expect(writes[0]).toMatchObject({ procurementProfile: { bankAccount: sampleVendorBankAccount } });
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
  it("places contact fields in Vendor Information and omits removed fields without erasing stored values", async () => {
    const view = start(); const user = userEvent.setup();
    const information = await screen.findByRole("region", { name: "Vendor Information" });
    for (const name of ["Email", "Phone Number", "Address"]) expect(within(information).getByRole("textbox", { name })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Contact Information" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Directory description|^Reference/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).not.toHaveProperty("description"); expect(writes[0].procurementProfile).not.toHaveProperty("reference");
    expect(stored.description).toBe("Timber supply"); expect(stored.procurementProfile!.reference).toBe("Synthetic reference");
    expect(stored.procurementProfile).toMatchObject({ email: "sample@example.test", phoneNumber: "+91 90000 00000", address: "Synthetic office address" });
  });
  it("requires a formatted GST Number, focuses its error, normalizes and reloads the saved value", async () => {
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" });
    await answer(user, "GST Registered", "Yes");
    const gst = screen.getByRole("textbox", { name: "GST Number" }); expect(gst).toBeRequired();
    for (const value of ["", "invalid"]) {
      fireEvent.change(gst, { target: { value } }); await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(gst).toHaveFocus()); expect(gst).toHaveAccessibleDescription(/valid 15-character/); expect(writes).toHaveLength(0);
    }
    fireEvent.change(gst, { target: { value: "27abcde1234f1z5" } });
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { gstRegistered: true, gstNumber: "27ABCDE1234F1Z5" } });
    view.unmount(); start(); expect(await screen.findByRole("textbox", { name: "GST Number" })).toHaveValue("27ABCDE1234F1Z5");
  });
  it("keeps legacy registration data visible and clears GST and MSME requirements when No is selected", async () => {
    stored.procurementProfile!.gstRegistered = true; stored.procurementProfile!.msmeRegistered = true;
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "GST Number" });
    expect(screen.getByRole("textbox", { name: "Position" })).toHaveValue("Owner");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Upload an MSME Certificate.")).toBeVisible();
    await answer(user, "GST Registered", "No"); await answer(user, "MSME Registered", "No");
    expect(screen.queryByRole("textbox", { name: "GST Number" })).not.toBeInTheDocument(); expect(screen.queryByLabelText(/^MSME Certificate/)).not.toBeInTheDocument();
    expect(screen.queryByText("Upload an MSME Certificate.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(writes[0]).toMatchObject({ procurementProfile: { gstRegistered: false, gstNumber: null, msmeRegistered: false } });
    expect(writes[0]).not.toHaveProperty("msmeCertificateUploadId");
  });
  it("stages required evidence before creating a vendor with both GST and MSME Yes", async () => {
    const uploads: FormData[] = [];
    vi.spyOn(apiClient, "postMultipart").mockImplementation(async (_url, body) => { uploads.push(body); expect(writes).toHaveLength(0); return stagedCertificate as never; });
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user);
    await answer(user, "GST Registered", "Yes"); fireEvent.change(screen.getByRole("textbox", { name: "GST Number" }), { target: { value: "27ABCDE1234F1Z5" } });
    await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    await waitFor(() => expect(screen.getByLabelText(/^MSME Certificate/)).toHaveFocus()); expect(writes).toHaveLength(0);
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    expect(uploads).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(uploads).toHaveLength(1); expect(uploads[0].get("expectedVersion")).toBeNull();
    expect(writes[0]).toMatchObject({ msmeCertificateUploadId: "upload-one", procurementProfile: { gstNumber: "27ABCDE1234F1Z5", msmeRegistered: true } });
    view.unmount(); start(); expect(await screen.findByText("Saved certificate: synthetic-msme.pdf")).toBeVisible();
  });
  it("retains the file and upload identity after uncertain staging without saving a vendor", async () => {
    const uploads: FormData[] = [];
    vi.spyOn(apiClient, "postMultipart").mockImplementation(async (_url, body) => { uploads.push(body); if (uploads.length === 1) throw new ApiError(503, "TEMPORARY", "Upload response lost"); return stagedCertificate as never; });
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" }); await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText(/certificate upload was not confirmed/);
    expect(writes).toHaveLength(0); expect(view.saved).not.toHaveBeenCalled(); expect(screen.getByText("Selected: synthetic-msme.pdf")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(uploads).toHaveLength(2); expect(uploads[0].get("idempotencyKey")).toEqual(uploads[1].get("idempotencyKey")); expect(uploads[1].get("expectedVersion")).toBe("1");
  });
  it("replays a staged save after an uncertain result without uploading or creating again", async () => {
    const upload = vi.spyOn(apiClient, "postMultipart").mockResolvedValue(stagedCertificate as never);
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/vendors", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      stored = { ...stored, id: "vendor-created", name: input.name as string, procurementProfile: { ...stored.procurementProfile!, ...input.procurementProfile as ProcurementVendorProfile }, msmeCertificate: savedCertificate };
      return writes.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Response lost" } }, { status: 503 }) : response(safe(stored));
    }));
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user); await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await user.click(await screen.findByRole("button", { name: "Retry vendor save" }));
    await waitFor(() => expect(view.saved).toHaveBeenCalledOnce()); expect(upload).toHaveBeenCalledOnce(); expect(writes[1]).toEqual(writes[0]);
  });
  it.each(["oversized", "unsupported", "empty"])("rejects a %s certificate before staging", async (kind) => {
    const upload = vi.spyOn(apiClient, "postMultipart"); start(); const user = userEvent.setup({ applyAccept: false }); await screen.findByRole("textbox", { name: "Entity Name" });
    await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    const file = new File([kind === "empty" ? "" : "content"], "certificate.pdf", { type: kind === "unsupported" ? "text/plain" : "application/pdf" });
    if (kind === "oversized") Object.defineProperty(file, "size", { value: 1048577 });
    await user.upload(screen.getByLabelText(/^MSME Certificate/), file); await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByLabelText(/^MSME Certificate/)).toHaveAccessibleDescription(kind === "oversized" ? /bytes or smaller/ : /nonempty PDF/); expect(upload).not.toHaveBeenCalled(); expect(writes).toHaveLength(0);
  });
  it("requires the server upload policy and allows policy retry without discarding the selected file", async () => {
    let attempts = 0;
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/msme-certificate-upload-policy", () => ++attempts === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Policy unavailable" } }, { status: 503 }) : response({ maxUploadBytes: 1048576, allowedMimeTypes: ["application/pdf"], uploadLifetimeSeconds: 3600 })));
    vi.spyOn(apiClient, "postMultipart").mockResolvedValue(stagedCertificate as never);
    const view = start(); const user = userEvent.setup(); await screen.findByRole("textbox", { name: "Entity Name" }); await answer(user, "MSME Registered", "Yes");
    await screen.findByRole("button", { name: "Retry certificate requirements" });
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Save changes" })); expect(writes).toHaveLength(0);
    expect(screen.getByLabelText(/^MSME Certificate/)).toHaveAccessibleDescription(/Load the certificate upload requirements/);
    await user.click(screen.getByRole("button", { name: "Retry certificate requirements" })); await screen.findByText(/Maximum 1 MB/);
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
  });
  it.each(["viewer", "archived"])("reuses a saved certificate and keeps authenticated download available in %s views", async (access) => {
    stored.procurementProfile!.msmeRegistered = true; stored.msmeCertificate = savedCertificate;
    const upload = vi.spyOn(apiClient, "postMultipart");
    const download = vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["%PDF"], { type: "application/pdf" }), filename: undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const view = start(); const user = userEvent.setup(); await screen.findByText("Saved certificate: synthetic-msme.pdf");
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(upload).not.toHaveBeenCalled(); expect(writes[0]).not.toHaveProperty("msmeCertificateUploadId");
    view.unmount(); if (access === "archived") stored = { ...stored, status: "archived" }; start(true, false, access === "archived"); const button = await screen.findByRole("button", { name: "Download MSME certificate" }); expect(button).toBeEnabled();
    expect(screen.queryByLabelText(/^MSME Certificate/)).not.toBeInTheDocument(); await user.click(button);
    await waitFor(() => expect(download).toHaveBeenCalledWith(savedCertificate.url, expect.objectContaining({ maxBytes: 4 })));
    expect(screen.getByRole("textbox", { name: "Position" })).toBeDisabled(); for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
  it("preserves existing evidence on failed replacement, restages after version reload, then saves the selected file", async () => {
    stored.procurementProfile!.msmeRegistered = true; stored.msmeCertificate = savedCertificate;
    const uploads: FormData[] = [];
    vi.spyOn(apiClient, "postMultipart").mockImplementation(async (_url, body) => { uploads.push(body); return { ...stagedCertificate, uploadId: `upload-${uploads.length}` } as never; });
    let attempts = 0;
    server.use(http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/:id", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push(input);
      if (++attempts === 1) { stored = { ...stored, version: 2 }; return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Vendor changed" } }, { status: 409 }); }
      stored = { ...stored, version: 3, msmeCertificate: { ...savedCertificate, originalFilename: "replacement.pdf", id: "certificate-new" } }; return response(safe(stored));
    }));
    const view = start(); const user = userEvent.setup(); await screen.findByText(/Maximum 1 MB/);
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "replacement.pdf", { type: "application/pdf" })); await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Vendor changed"); expect(stored.msmeCertificate.id).toBe("certificate-one"); expect(view.saved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reload latest and replace entries" })); await screen.findByText(/Latest vendor loaded/);
    expect(screen.getByText("Selected: replacement.pdf")).toBeVisible(); await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(uploads[0].get("idempotencyKey")).not.toEqual(uploads[1].get("idempotencyKey")); expect(uploads[1].get("expectedVersion")).toBe("2"); expect(writes[0].idempotencyKey).not.toEqual(writes[1].idempotencyKey);
  });
  it("detaches a saved certificate only when MSME No is saved, and preserves evidence on cancel", async () => {
    stored.procurementProfile!.msmeRegistered = true; stored.msmeCertificate = savedCertificate;
    const view = start(); const user = userEvent.setup(); await screen.findByText("Saved certificate: synthetic-msme.pdf"); await answer(user, "MSME Registered", "No");
    expect(stored.msmeCertificate).toEqual(savedCertificate); await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(writes).toHaveLength(0); expect(stored.msmeCertificate).toEqual(savedCertificate);
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce()); expect(stored.msmeCertificate).toBeNull();
  });

  it("keeps staging controls disabled, then retries only the optional photo after the required certificate is saved", async () => {
    let release!: (result: unknown) => void;
    const staged = new Promise((resolve) => { release = resolve; });
    const upload = vi.spyOn(apiClient, "postMultipart").mockImplementation(() => staged as never);
    const photo = vi.spyOn(apiClient, "putMultipart").mockImplementation(async () => {
      expect(stored.msmeCertificate).not.toBeNull();
      if (photo.mock.calls.length === 1) throw new ApiError(503, "TEMPORARY", "Picture service unavailable");
      return { vendorId: stored.id, version: stored.version + 1, geoTaggedPicture: null } as never;
    });
    const view = start(false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name }); await fillNew(user); await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    await user.upload(screen.getByLabelText("Geo Tagged Picture of the Vendor"), new File(["fake"], "synthetic.png", { type: "image/png" }));
    const accessibility = await axe.run(screen.getByRole("dialog", { name: "Add vendor" }), { rules: { "color-contrast": { enabled: false } } }); expect(accessibility.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await screen.findByText("Uploading: synthetic-msme.pdf");
    expect(screen.getByLabelText(/^MSME Certificate/)).toBeDisabled(); expect(screen.getByRole("button", { name: "Clear selected certificate" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Save vendor" })).toBeDisabled(); expect(writes).toHaveLength(0);
    await act(async () => release(stagedCertificate)); await screen.findByText(/Vendor saved, but the picture has not been confirmed/);
    expect(view.saved).not.toHaveBeenCalled(); expect(writes).toHaveLength(1); expect(stored.msmeCertificate).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry picture attachment" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledOnce(); expect(photo).toHaveBeenCalledTimes(2); expect(writes).toHaveLength(1);
  });
  it("normalizes a legacy Supplier No without another classification choice", async () => {
    stored.procurementProfile = { ...stored.procurementProfile!, vendorType: "supplier", executionType: null, supplier: false };
    const view = start(); const user = userEvent.setup(); expect(await screen.findByRole("radio", { name: "Supplier" })).toBeChecked();
    expect(screen.queryByRole("group", { name: /^Supplier/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce()); expect(writes[0]).toMatchObject({ procurementProfile: { supplier: true, executionType: null } });
  });

  it("allows create-only users to save the profile and required certificate while keeping optional photo controls disabled", async () => {
    const upload = vi.spyOn(apiClient, "postMultipart").mockResolvedValue(stagedCertificate as never);
    const view = start(false, false, false); const user = userEvent.setup(); await screen.findByRole("option", { name: vendorBasket.name });
    expect(screen.getByRole("textbox", { name: "Entity Name" })).toBeEnabled(); expect(screen.getByRole("button", { name: "Save vendor" })).toBeEnabled();
    expect(screen.getByLabelText("Geo Tagged Picture of the Vendor")).toBeDisabled();
    await fillNew(user); await answer(user, "GST Registered", "Yes"); const gst = screen.getByRole("textbox", { name: "GST Number" }); expect(gst).toBeEnabled();
    fireEvent.change(gst, { target: { value: "27ABCDE1234F1Z5" } }); await answer(user, "MSME Registered", "Yes"); await screen.findByText(/Maximum 1 MB/);
    expect(screen.getByLabelText(/^MSME Certificate/)).toBeEnabled();
    await user.upload(screen.getByLabelText(/^MSME Certificate/), new File(["%PDF"], "synthetic-msme.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("button", { name: "Clear selected certificate" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save vendor" })); await waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors/msme-certificate-uploads", expect.any(FormData));
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ msmeCertificateUploadId: "upload-one", procurementProfile: { gstNumber: "27ABCDE1234F1Z5", msmeRegistered: true } });
  });

});

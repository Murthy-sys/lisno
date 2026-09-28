import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import type { VendorKpiStaffDetail } from "../../../../shared/knowledge/vendorKpi";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { VendorKpiStaffScreen } from "./VendorKpiStaffScreen";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ ScaffoldContentBack: () => null }));
jest.mock("../knowledge/KnowledgeVendorEditor", () => ({ KnowledgeVendorEditor: ({ existing }: { existing: { name: string } }) => {
  const Text = require("react-native").Text;
  return <Text>Vendor profile editor: {existing.name}</Text>;
} }));

const get = jest.fn();
const put = jest.fn();
const post = jest.fn();
const invalidate = jest.fn(async () => undefined);
const vendor = { id: "vendor-one", code: "V001", name: "Supplier Co", status: "active" as const, vendorType: "supplier" as const, workProfile: "Materials", mainBasketNames: ["Carpentry"], subBasketNames: ["Joinery"], emailAvailable: true };
const self = { id: "self-one", vendorId: vendor.id, source: "vendor_self" as const, vendorType: "supplier" as const, rubricVersion: 1, scores: [
  { key: "rates_offered" as const, score: 90 }, { key: "service_communication" as const, score: 95 }, { key: "delivery_coordination" as const, score: 85 }, { key: "defect_liability_addressal" as const, score: 80 }, { key: "commitment_to_timelines" as const, score: 75 }
], averageScoreBps: 8500, revision: 1, comment: null, submittedAt: "2026-09-28T10:00:00.000Z" };
const staff = { ...self, id: "staff-one", source: "procurement" as const, scores: self.scores.map(row => ({ ...row, score: 81 })), averageScoreBps: 8100, revision: 2, submittedAt: "2026-09-28T11:00:00.000Z" };
const detail: VendorKpiStaffDetail = { vendor, rubricVersion: 1, selfAssessment: self, procurementAssessment: staff, officialScoreBps: 8100, request: null, requestEligibility: "self_submitted" };
const permissions = ["procurement.vendor_kpi.read", "procurement.vendor_kpi.rate", "procurement.vendor_kpi.request", "procurement.vendor_directory.read", "procurement.vendor_directory.update"];
function session(role = "procurement", grants: readonly string[] = permissions): AuthenticatedSession {
  return { user: { id: `${role}-one`, role }, authorization: { permissions: grants } } as unknown as AuthenticatedSession;
}
function setup(currentDetail: VendorKpiStaffDetail = detail) {
  get.mockImplementation(async (path: string) => path.includes("vendor-kpis") ? currentDetail : { ...vendor, masterType: "vendors", version: 2 });
  put.mockResolvedValue(currentDetail);
  post.mockResolvedValue(currentDetail);
  jest.mocked(useConfiguredRuntime).mockReturnValue({
    environment: { environment: { id: "env-one" }, status: "ready", generation: 1 },
    session: { status: "authenticated", session: session(), generation: 1 },
    runtime: { api: { authenticated: { get, put, post, patch: jest.fn(), delete: jest.fn() } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
  jest.mocked(useInvalidateEvent).mockReturnValue(invalidate);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const mount = (actor = session()) => render(<QueryClientProvider client={client}><VendorKpiStaffScreen session={actor} vendorId="vendor-one" /></QueryClientProvider>);
  return { mount, client };
}
beforeEach(() => { jest.clearAllMocks(); setup(); });

describe("native vendor KPI detail", () => {
  it("shows distinct self, Procurement, and official scores for the supplier rubric", async () => {
    const { mount } = setup();
    const view = await mount();
    await view.findByText("Supplier Co");
    expect(view.getAllByText("81/100").length).toBeGreaterThan(0);
    expect(view.getAllByText("85/100").length).toBeGreaterThan(0);
    expect(view.getByText("Rates offered rating (0–100)")).toBeTruthy();
    expect(view.getByText("Commitment to timelines rating (0–100)")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Request KPI from vendor" })).toBeNull();
    expect(view.getByText("Work profile: Materials")).toBeTruthy();
  });

  it("saves a complete 0–100 staff assessment with CAS and refreshes vendor caches", async () => {
    const unrated = { ...detail, selfAssessment: null, procurementAssessment: null, officialScoreBps: null, requestEligibility: "ready" as const };
    const saved = { ...unrated, procurementAssessment: staff, officialScoreBps: 8100 };
    const { mount } = setup(unrated);
    put.mockResolvedValue(saved);
    const view = await mount();
    await view.findByText("Supplier Co");
    expect(view.getByRole("button", { name: "Save Procurement KPI" })).toBeDisabled();
    for (const [label, value] of [
      ["Rates offered rating (0–100)", "0"], ["Service communication rating (0–100)", "100"],
      ["Delivery coordination rating (0–100)", "85"], ["Defect liability addressal rating (0–100)", "90"],
      ["Commitment to timelines rating (0–100)", "75"]
    ] as const) await fireEvent.changeText(view.getByLabelText(label), value);
    await fireEvent.press(view.getByRole("button", { name: "Save Procurement KPI" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/procurement/vendor-kpis/vendor-one/procurement", expect.objectContaining({ rubricVersion: 1, expectedRevision: null, scores: expect.arrayContaining([{ key: "rates_offered", score: 0 }, { key: "service_communication", score: 100 }]) })));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith("knowledge-changed"));
    expect(view.getByText("Procurement KPI saved.")).toBeTruthy();
  });

  it("requests a vendor self rating only when eligible and preserves the request version", async () => {
    const pending = { status: "sent" as const, version: 3, requestedAt: "2026-09-28T10:00:00.000Z", sentAt: "2026-09-28T10:00:01.000Z", expiresAt: "2026-09-29T10:00:00.000Z", canResendAt: "2026-09-28T10:15:00.000Z" };
    const available = { ...detail, selfAssessment: null, request: pending, requestEligibility: "ready" as const };
    const response = { ...available, request: { ...pending, version: 4 }, requestEligibility: "cooldown" as const };
    const { mount } = setup(available);
    post.mockResolvedValue(response);
    const view = await mount();
    await view.findByRole("button", { name: "Resend KPI request" });
    await fireEvent.press(view.getByRole("button", { name: "Resend KPI request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/procurement/vendor-kpis/vendor-one/requests", expect.objectContaining({ expectedRequestVersion: 3, idempotencyKey: expect.any(String) })));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith("knowledge-changed"));
    expect(view.queryByRole("button", { name: "Resend KPI request" })).toBeNull();
  });

  it("keeps read, rate, and request permissions separate and hides private detail on 403", async () => {
    const { mount } = setup();
    const limited = await mount(session("super_admin", ["procurement.vendor_kpi.read", "ai_estimator_knowledge.configuration.read"]));
    await limited.findByText("Supplier Co");
    expect(limited.queryByRole("button", { name: "Save Procurement KPI" })).toBeNull();
    expect(limited.queryByRole("button", { name: "Request KPI from vendor" })).toBeNull();
    await limited.unmount();
    const deniedView = await mount(session("admin", permissions));
    expect(deniedView.getByText("Vendor KPI unavailable")).toBeTruthy();
    expect(deniedView.queryByText("Supplier Co")).toBeNull();
    await deniedView.unmount();
    const view = await mount();
    await view.findByText("Supplier Co");
    get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed"));
    let scroll = view.getByText("Supplier Co").parent;
    while (scroll && !scroll.props.refreshControl) scroll = scroll.parent;
    const refreshControl = scroll?.props.refreshControl as { props: { onRefresh: () => void } };
    await act(async () => { refreshControl.props.onRefresh(); });
    await view.findByText("Vendor KPI unavailable");
    expect(view.queryByText("Supplier Co")).toBeNull();
  });

  it("stops stale staff revisions and loads the existing vendor profile separately", async () => {
    const { mount } = setup();
    put.mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed"));
    const view = await mount(session("super_admin", [...permissions, "ai_estimator_knowledge.configuration.read", "ai_estimator_knowledge.configuration.update"]));
    await view.findByText("Supplier Co");
    await fireEvent.changeText(view.getByLabelText("Rates offered rating (0–100)"), "82");
    await fireEvent.press(view.getByRole("button", { name: "Save Procurement KPI" }));
    await view.findByText("This assessment changed. Reload the latest version before saving.");
    expect(view.getByRole("button", { name: "Save Procurement KPI" })).toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Edit vendor" }));
    await view.findByText("Vendor profile editor: Supplier Co");
    expect(get).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors/vendor-one");
  });
});

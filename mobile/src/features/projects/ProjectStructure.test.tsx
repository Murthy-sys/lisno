import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import * as Native from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ProjectStructure } from "./ProjectStructure";

const mockGet = jest.fn();
const mockDownload = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { ScaffoldContentBack: () => React.createElement(View, { testID: "content-back" }) };
});
jest.mock("../design/DesignVersionWorkspace", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    DesignVersionWorkspace: ({ projectId }: { readonly projectId: string }) => React.createElement(Text, { testID: `design-versions:${projectId}` }, "Design versions workspace"),
    DesignUploadAction: ({ taskId }: { readonly taskId: string }) => React.createElement(Text, { testID: `design-upload:${taskId}` }, "Design upload action")
  };
});
jest.mock("../estimates/ClientPlanReview", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { ClientPlanReview: ({ estimate }: { readonly estimate: { readonly id: string } }) => React.createElement(Text, { testID: `plan:${estimate.id}` }, "Client plan review") };
});
jest.mock("../estimates/ClientDrawingReview", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { ClientDrawingReview: ({ estimate }: { readonly estimate: { readonly id: string } }) => React.createElement(Text, { testID: `drawing:${estimate.id}` }, "Client drawing review") };
});
jest.mock("../design/ClientSectionReview", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { ClientSectionReview: ({ projectId }: { readonly projectId: string }) => React.createElement(Text, { testID: `sections:${projectId}` }, "Client section review") };
});
jest.mock("../workflows/WorkflowWorkspace", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { WorkflowWorkspace: ({ projectId }: { readonly projectId: string }) => React.createElement(Text, { testID: `workflow:${projectId}` }, "Workflow workspace") };
});
jest.mock("./HierarchyCreateActions", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    FloorCreateAction: ({ projectId }: { readonly projectId: string }) => React.createElement(Text, { testID: `floor-create:${projectId}` }, "Floor create action"),
    StageCreateAction: ({ floorId }: { readonly floorId: string }) => React.createElement(Text, { testID: `stage-create:${floorId}` }, "Stage create action"),
    TaskCreateAction: ({ stageId }: { readonly stageId: string }) => React.createElement(Text, { testID: `task-create:${stageId}` }, "Task create action")
  };
});
jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: () => ({
    environment: { environment: { id: "env-test" } },
    session: { status: "unauthenticated" },
    runtime: {
      api: { authenticated: { get: (...args: unknown[]) => mockGet(...args), patch: () => Promise.resolve(null), post: () => Promise.resolve(null) } },
      transfers: { download: (...args: unknown[]) => mockDownload(...args) }
    }
  })
}));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => async () => undefined }));

/** Permission codes behind the tab, menu and document gates (see contracts/operations.ts and navigation/registry.ts). */
const READ_DESIGNS = "design.version.read";
const READ_WORKFLOW = "projects.design_workflow.read";
const ESTIMATE_PDF = "estimation.estimate_pdf.download";
const DOWNLOAD_DESIGN = "design.version.download";
const CLIENT_ESTIMATES = "estimation.client_estimate.list";
const CLIENT_ESTIMATE_PDF = "estimation.client_estimate_pdf.download";
const CLIENT_PLAN_READ = "estimation.client_plan_review.read";
const CLIENT_DRAWINGS_READ = "estimation.client_drawings.read";
const CLIENT_SECTIONS_READ = "design.client_sections.read";
const READ_CHAT = "chat.read";
const SELF_TASK_UPDATE = "design.task.self.update";
const ADMIN_READS = [READ_DESIGNS, READ_WORKFLOW, ESTIMATE_PDF] as const;
const ALL_TABS = ["Information", "Estimation", "Designs", "Documents", "Team", "Tasks"] as const;

/** A real authorization snapshot: operation gates and the messages feature are resolved by the production helpers. */
function session(role: Role, permissions: readonly string[] = []): AuthenticatedSession {
  return {
    user: { id: `session-${role}`, name: "Signed-in user", email: `${role}@example.test`, role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...permissions] }
  } as AuthenticatedSession;
}

/** Approved estimate, assigned design plan: the baseline total differs from the mutable estimate total. */
function lakesideAdmin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "project-admin-lakeside",
    name: "Lakeside Villa",
    status: "active",
    location: "Whitefield, Bengaluru",
    client: { name: "Asha Rao", email: "asha@example.test", mobile: "+91 90000 00001" },
    propertyType: "Villa",
    budgetMin: 1200000,
    budgetMax: 1800000,
    estimator: { id: "user-sales-1", name: "Ravi Kumar", email: "ravi@example.test" },
    lead: { id: "lead-internal-1", stage: "proposal_sent", nextAction: "Share revised moodboard", nextActionAt: "2026-09-24T09:05:00.000Z" },
    estimate: {
      id: "estimate-internal-1",
      version: 4,
      status: "client_approved",
      subtotal: 2000000,
      gst: 360000,
      total: 2360000,
      approvedBaseline: { estimateVersion: 3, subtotal: 1800000, gst: 324000, total: 2124000 },
      designPlanStatus: "assigned",
      designPlanDesigner: { id: "user-designer-1", name: "Meera Iyer", email: "meera@example.test" }
    },
    createdAt: "2026-09-22T18:30:00.000Z",
    ...overrides
  };
}

/** A second, unequal admin project: approved estimate still waiting for design assignment. */
function harbourAdmin(): Record<string, unknown> {
  return {
    id: "project-admin-harbour",
    name: "Harbour Loft",
    status: "planning",
    location: "Fort Kochi",
    client: { name: "Kiran Das", email: "kiran@example.test" },
    propertyType: "Apartment",
    budgetMin: 2500000,
    budgetMax: 3200000,
    estimator: { id: "user-sales-2", name: "Devi Nair", email: "devi@example.test" },
    lead: { id: "lead-internal-2", stage: "won", nextAction: "Collect keys", nextActionAt: "2026-08-10T04:30:00.000Z" },
    estimate: {
      id: "estimate-internal-2",
      version: 2,
      status: "client_approved",
      total: 3540000,
      approvedBaseline: { estimateVersion: 2, total: 2950000 },
      designPlanStatus: "pending_assignment"
    },
    createdAt: "2026-08-03T05:00:00.000Z"
  };
}

/** Staff hierarchy: people other than the client are known only by ID and must never render. */
function palmHierarchy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "project-palm",
    name: "Palm Residency",
    status: "on_hold",
    location: "Panampilly Nagar, Kochi",
    clientName: "Anil Menon",
    clientEmail: "anil@example.test",
    clientMobile: "+91 90000 00002",
    clientAddress: "12 Marine Drive, Kochi",
    plannedStartAt: "2026-01-05T00:00:00.000Z",
    plannedEndAt: "2026-06-30T00:00:00.000Z",
    actualStartAt: "2026-01-12T00:00:00.000Z",
    actualEndAt: null,
    createdAt: "2025-12-20T10:00:00.000Z",
    updatedAt: "2026-03-02T08:15:00.000Z",
    progress: 37.6,
    assignedDesignerIds: ["user-designer-7"],
    managerId: "user-manager-9",
    siteManagerId: "user-site-9",
    floors: [
      {
        id: "floor-ground",
        name: "Ground floor",
        stages: [
          {
            id: "stage-concept",
            name: "Concept mood board",
            tasks: [
              { id: "task-moodboard", title: "Prepare living room moodboard", status: "in_progress", progress: 40, version: 2, ownerId: "user-designer-7" },
              { id: "task-palette", title: "Finalise colour palette", status: "not_started", progress: 0, ownerId: "user-designer-7" }
            ]
          }
        ]
      },
      { id: "floor-first", name: "First floor", stages: [] }
    ],
    ...overrides
  };
}

/** Client view; stray contact fields prove the client presentation never reads them. */
function gardenClientView(): Record<string, unknown> {
  return {
    id: "project-garden",
    name: "Garden Court",
    status: "active",
    location: "Thrissur",
    clientName: "Stray Contact",
    clientEmail: "stray@example.test",
    plannedStartAt: "2026-04-01T00:00:00.000Z",
    plannedEndAt: "2026-11-15T00:00:00.000Z",
    createdAt: "2026-03-10T09:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    progress: 12,
    floors: [{ id: "floor-garden", name: "Garden floor", stages: [] }]
  };
}

function clientEstimates() {
  return [
    { id: "estimate-garden", projectId: "project-garden", status: "client_approved", designPlanStatus: "ready_for_client", total: 420000, lineItems: [], lead: { projectName: "Garden Court", location: "Thrissur" } },
    { id: "estimate-harbour", projectId: "project-harbour", status: "sent_to_client", designPlanStatus: null, total: 990000, lineItems: [], lead: { projectName: "Harbour House", location: "Kochi" } },
    { id: "estimate-pending", projectId: null, status: "sent_to_client", designPlanStatus: null, total: 760000, lineItems: [], lead: { projectName: "Unlinked home" } }
  ];
}

function versionsPayload(items: readonly Record<string, unknown>[]) {
  return { items, pagination: { limit: 30, offset: 0, total: items.length, hasMore: false } };
}

/** One approved and one pending version: only the approved file may be listed under Documents. */
const LAKESIDE_VERSIONS = versionsPayload([
  { id: "version-lakeside-3", versionNumber: 3, originalFilename: "lakeside-living-room.pdf", mimeType: "application/pdf", approvalStatus: "approved", approvedAt: "2026-09-05T10:00:00.000Z" },
  { id: "version-lakeside-4", versionNumber: 4, originalFilename: "lakeside-kitchen-pending.pdf", mimeType: "application/pdf", approvalStatus: "pending", approvedAt: null }
]);

function sharedArtifact() {
  return { uri: "file:///synthetic/document", fileName: "document", mimeType: "application/pdf", sizeBytes: 10, share: jest.fn(async () => undefined), release: jest.fn(async () => undefined) };
}

/**
 * `import * as Native` yields a namespace copy, so spying on it would not reach the component. The
 * react-native index re-reads this module's default export on every access, so spy on it directly.
 */
const windowDimensions = require("react-native/Libraries/Utilities/useWindowDimensions") as { default: typeof Native.useWindowDimensions };

function setWindow(width: number, fontScale = 1) {
  jest.spyOn(windowDimensions, "default").mockReturnValue({ width, height: 900, scale: 1, fontScale });
}

async function renderProject(data: unknown, activeSession: AuthenticatedSession, onRefresh: () => void = jest.fn(), initialTab?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<ProjectStructure data={data} session={activeSession} onRefresh={onRefresh} initialTab={initialTab} />, { wrapper });
}

type RenderedView = Awaited<ReturnType<typeof renderProject>>;
type RenderedNode = string | { readonly type: string; readonly props: Record<string, unknown>; readonly children: readonly RenderedNode[] | null };
type HostElement = ReturnType<RenderedView["getByTestId"]>;

function walk(node: RenderedNode | null, visit: (node: Exclude<RenderedNode, string> | string) => void) {
  if (node === null) return;
  visit(node);
  if (typeof node !== "string") for (const child of node.children ?? []) walk(child, visit);
}

/** Document-order tokens: `#testID` for identified elements, plus every text child. */
function documentOrder(view: RenderedView): readonly string[] {
  const tokens: string[] = [];
  walk(view.toJSON() as RenderedNode | null, (node) => {
    if (typeof node === "string") tokens.push(node);
    else if (typeof node.props.testID === "string") tokens.push(`#${node.props.testID}`);
  });
  return tokens;
}

/** Everything a sighted or screen-reader user can perceive: text children, accessibility labels and hints. */
function perceivableText(view: RenderedView): string {
  const values: string[] = [];
  walk(view.toJSON() as RenderedNode | null, (node) => {
    if (typeof node === "string") values.push(node);
    else for (const key of ["accessibilityLabel", "accessibilityHint"]) if (typeof node.props[key] === "string") values.push(node.props[key] as string);
  });
  return values.join("\n");
}

function position(tokens: readonly string[], token: string): number {
  const index = tokens.indexOf(token);
  if (index < 0) throw new Error(`Expected ${token} in the rendered tree`);
  return index;
}

function expectInDocumentOrder(view: RenderedView, expected: readonly string[]) {
  const tokens = documentOrder(view);
  const order = expected.map((token) => position(tokens, token));
  expect([...order].sort((left, right) => left - right)).toEqual(order);
}

function flatStyle(element: { readonly props: Record<string, unknown> }): Record<string, unknown> {
  return (Native.StyleSheet.flatten(element.props.style as Native.StyleProp<Native.ViewStyle>) ?? {}) as Record<string, unknown>;
}

function tabNames(view: RenderedView): readonly string[] {
  return view.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel as string);
}

/** The tab row container (a plain View with the tablist role; RNTL role queries only match accessibility elements). */
function tabList(view: RenderedView): HostElement {
  const parent = view.getByRole("tab", { name: "Information" }).parent;
  if (!parent) throw new Error("Tabs have no container");
  return parent as HostElement;
}

/** The open ⋮ menu panel: role "menu", announced as "Project actions". */
function actionsMenu(view: RenderedView): HostElement {
  const menu = view.getByTestId("project-actions-menu");
  expect(menu.props.accessibilityRole).toBe("menu");
  expect(menu.props.accessibilityLabel).toBe("Project actions");
  return menu;
}

async function openTab(view: RenderedView, name: string) {
  await fireEvent.press(view.getByRole("tab", { name }));
  expect(view.getByRole("tab", { name })).toBeSelected();
}

/** Label Text of an icon row; its parent is the label/value container whose direction shows side-by-side vs stacked. */
function rowCopy(row: HostElement, label: string): HostElement {
  const parent = within(row).getByText(label).parent;
  if (!parent) throw new Error(`No container for ${label}`);
  return parent as HostElement;
}

describe("ProjectStructure project detail page", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDownload.mockReset();
    mockPush.mockReset();
    mockGet.mockResolvedValue(versionsPayload([]));
  });
  afterEach(() => jest.restoreAllMocks());

  it("matches the admin reference: header, summary, value card, tab strip and the Information panel in order", async () => {
    setWindow(390);
    const view = await renderProject(lakesideAdmin(), session("super_admin", ADMIN_READS));

    expectInDocumentOrder(view, [
      "#project-detail-page",
      "#project-detail-header",
      "#content-back",
      "#project-detail-actions-button",
      "Project Details",
      "Client, property and budget details",
      "#project-summary-card",
      "Lakeside Villa",
      "#project-summary-fact-client",
      "#project-summary-fact-propertyType",
      "#project-summary-fact-location",
      "#project-summary-fact-created",
      "#project-value-card",
      "#project-tab-information",
      "#project-tab-estimation",
      "#project-tab-designs",
      "#project-tab-documents",
      "#project-tab-team",
      "#project-tab-tasks",
      "#project-tab-panel-information",
      "Project information",
      "Assignment & progress"
    ]);

    // Header: Back and ⋮, title and admin subtitle, decorative leaves hidden from assistive technology. No Edit (D1).
    const header = within(view.getByTestId("project-detail-header"));
    expect(header.getByTestId("content-back")).toBeTruthy();
    expect(header.getByRole("header", { name: "Project Details" })).toBeTruthy();
    expect(header.getByText("Client, property and budget details")).toBeTruthy();
    const kebab = header.getByRole("button", { name: "More project actions" });
    expect(kebab).toBeCollapsed();
    expect(kebab).toHaveStyle({ width: 44, height: 44 });
    expect(view.queryByTestId("project-detail-leaves")).toBeNull();
    expect(view.getByTestId("project-detail-leaves", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText(/\bedit\b/i)).toBeNull();
    expect(view.queryByRole("button", { name: /\bedit\b/i })).toBeNull();
    expect(perceivableText(view)).not.toMatch(/\bedit\b/i);

    // Summary card: decorative thumbnail, project name, the admin 2×2 facts with icons and dividers.
    const summaryCard = view.getByTestId("project-summary-card");
    const summary = within(summaryCard);
    expect(summary.getByRole("header", { name: "Lakeside Villa" })).toBeTruthy();
    expect(summary.queryByTestId("project-summary-thumbnail")).toBeNull();
    const thumbnail = summary.getByTestId("project-summary-thumbnail", { includeHiddenElements: true });
    expect(within(thumbnail).getByTestId("glyph-image", { includeHiddenElements: true })).toBeTruthy();
    for (const [key, label, glyph] of [
      ["client", "Client: Asha Rao", "person"],
      ["propertyType", "Property type: Villa", "home"],
      ["location", "Location: Whitefield, Bengaluru", "pin"],
      ["created", "Created: 22 Sep 2026", "calendar"]
    ] as const) {
      const fact = summary.getByTestId(`project-summary-fact-${key}`);
      expect(fact.props.accessibilityLabel).toBe(label);
      expect(within(fact).getByTestId(`glyph-${glyph}`, { includeHiddenElements: true })).toBeTruthy();
    }
    // The right-hand column carries the vertical divider; the second row carries the horizontal one.
    expect(summary.getByTestId("project-summary-fact-propertyType")).toHaveStyle({ borderLeftWidth: Native.StyleSheet.hairlineWidth });
    expect(summary.getByTestId("project-summary-fact-created")).toHaveStyle({ borderLeftWidth: Native.StyleSheet.hairlineWidth });
    expect(flatStyle(summary.getByTestId("project-summary-fact-client")).borderLeftWidth).toBeUndefined();
    expect(summary.getByTestId("project-summary-fact-client").parent).toHaveStyle({ flexDirection: "row" });
    expect(summary.getByTestId("project-summary-fact-location").parent).toHaveStyle({ borderTopWidth: Native.StyleSheet.hairlineWidth });

    // Value card: the immutable approved baseline with the "Approved" pill, announced as one element.
    const valueCard = view.getByLabelText("Client-approved value (incl. GST): ₹21,24,000, Approved");
    expect(valueCard.props.testID).toBe("project-value-card");
    expect(within(valueCard).getByText("₹21,24,000")).toBeTruthy();
    const pill = within(valueCard).getByTestId("project-value-pill");
    expect(within(pill).getByText("Approved")).toBeTruthy();
    expect(within(pill).getByTestId("glyph-check", { includeHiddenElements: true })).toBeTruthy();

    // Tab strip: all six tabs in order, Information selected and the only mounted panel.
    expect(tabList(view).props.accessibilityRole).toBe("tablist");
    expect(tabNames(view)).toEqual(ALL_TABS);
    expect(view.getByRole("tab", { name: "Information" })).toBeSelected();
    for (const name of ALL_TABS.slice(1)) expect(view.getByRole("tab", { name })).not.toBeSelected();
    for (const tab of view.getAllByRole("tab")) expect(Number(flatStyle(tab).minHeight)).toBeGreaterThanOrEqual(44);
    expect(view.getByTestId("project-tab-panel-information")).toBeVisible();
    for (const key of ["estimation", "designs", "documents", "team", "tasks"]) {
      expect(view.queryByTestId(`project-tab-panel-${key}`, { includeHiddenElements: true })).toBeNull();
    }
    expect(view.queryByTestId("design-versions:project-admin-lakeside", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId("project-structure-panel", { includeHiddenElements: true })).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();

    // Information panel: Project information (PROJECT and CLIENT icon rows) and Assignment & progress (STATUS first).
    const information = within(view.getByTestId("project-tab-panel-information"));
    expect(information.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(information.getByRole("button", { name: "Assignment & progress" })).toBeExpanded();
    const projectGroup = within(information.getByTestId("project-detail-section-information-group-project"));
    expect(projectGroup.getByRole("header", { name: "Project" })).toBeTruthy();
    const clientGroup = within(information.getByTestId("project-detail-section-information-group-client"));
    expect(clientGroup.getByRole("header", { name: "Client" })).toBeTruthy();
    for (const [group, label, glyph] of [
      [projectGroup, "Location: Whitefield, Bengaluru", "pin"],
      [projectGroup, "Property type: Villa", "home"],
      [projectGroup, "Initial client budget range: ₹12,00,000 – ₹18,00,000", "rupee"],
      [clientGroup, "Client name: Asha Rao", "person"],
      [clientGroup, "Email: asha@example.test", "mail"],
      [clientGroup, "Mobile: +91 90000 00001", "phone"]
    ] as const) {
      expect(within(group.getByLabelText(label)).getByTestId(`glyph-${glyph}`, { includeHiddenElements: true })).toBeTruthy();
    }
    const statusGroup = within(information.getByTestId("project-detail-section-assignment-group-status"));
    expect(statusGroup.getByRole("header", { name: "Status" })).toBeTruthy();
    expect(statusGroup.getByLabelText("Project status: Active")).toBeTruthy();
    expect(within(information.getByTestId("project-detail-section-assignment-group-sales")).getByLabelText("Assigned to: Ravi Kumar")).toBeTruthy();
    expect(within(information.getByTestId("project-detail-section-assignment-group-lead")).getByLabelText("Next action: Share revised moodboard")).toBeTruthy();
    expectInDocumentOrder(view, [
      "#project-detail-section-assignment-group-status",
      "#project-detail-section-assignment-group-sales",
      "#project-detail-section-assignment-group-lead"
    ]);

    // Finance and lineage: the mutable total, internal IDs and removed hero copy never render.
    const text = perceivableText(view);
    for (const hidden of ["23,60,000", "project-admin-lakeside", "estimate-internal-1", "lead-internal-1", "user-sales-1", "user-designer-1", "Quick summary", "Project ID"]) {
      expect(text).not.toContain(hidden);
    }
    expect(text).not.toMatch(/photo/i);
  });

  it("keeps the facts beside the thumbnail when every word fits a cell, and moves them below when one would break", async () => {
    // Short words at a common Android width: the reference layout, facts beside the thumbnail.
    setWindow(411);
    const fits = await renderProject(lakesideAdmin({ location: "Bangalore", client: { name: "test1", email: "test1@example.test" } }), session("super_admin", ADMIN_READS));
    expect(fits.getByTestId("project-summary-card")).toHaveStyle({ flexDirection: "row" });
    await fits.unmount();

    // "Whitefield," would break mid-word in a 390-wide cell: the grid moves below a smaller thumbnail and the name.
    setWindow(390);
    const below = await renderProject(lakesideAdmin(), session("super_admin", ADMIN_READS));
    const card = below.getByTestId("project-summary-card");
    expect(card).toHaveStyle({ flexDirection: "column" });
    expect(below.getByTestId("project-summary-thumbnail", { includeHiddenElements: true })).toHaveStyle({ width: 88 });
    expect(within(card).getByTestId("project-summary-fact-location").props.accessibilityLabel).toBe("Location: Whitefield, Bengaluru");
    expect(within(card).getByTestId("project-summary-fact-propertyType")).toHaveStyle({ borderLeftWidth: Native.StyleSheet.hairlineWidth });
  });

  describe("finance on the admin payload", () => {
    beforeEach(() => {
      mockDownload.mockImplementation(() => ({ result: Promise.resolve(sharedArtifact()), cancel: jest.fn() }));
    });

    it("keeps two unequal admin projects' baselines, statuses, people and estimate IDs apart", async () => {
      setWindow(390);
      const admin = session("admin", ADMIN_READS);

      const harbour = await renderProject(harbourAdmin(), admin);
      expect(harbour.getByRole("header", { name: "Harbour Loft" })).toBeTruthy();
      expect(harbour.getByLabelText("Client-approved value (incl. GST): ₹29,50,000, Approved")).toBeTruthy();
      const harbourSummary = within(harbour.getByTestId("project-summary-card"));
      for (const label of ["Client: Kiran Das", "Property type: Apartment", "Location: Fort Kochi", "Created: 03 Aug 2026"]) expect(harbourSummary.getByLabelText(label)).toBeTruthy();
      expect(within(harbour.getByTestId("project-detail-section-assignment-group-status")).getByLabelText("Project status: Estimation Approval")).toBeTruthy();
      expect(within(harbour.getByTestId("project-detail-section-assignment-group-lead")).getByLabelText("Next action: Assign Designer to upload design")).toBeTruthy();
      expect(within(harbour.getByTestId("project-detail-section-information-group-client")).getByLabelText("Mobile: Not captured")).toBeTruthy();

      await openTab(harbour, "Estimation");
      const harbourEstimate = within(harbour.getByTestId("project-estimate-panel"));
      expect(harbourEstimate.getByRole("header", { name: "Estimate" })).toBeTruthy();
      for (const label of ["Status: Client Approved", "Client-approved value (incl. GST): ₹29,50,000", "Approved estimate baseline: Version 2", "Initial client budget range: ₹25,00,000 – ₹32,00,000"]) {
        expect(harbourEstimate.getByLabelText(label)).toBeTruthy();
      }

      await openTab(harbour, "Team");
      const harbourTeam = within(harbour.getByTestId("project-team-panel"));
      expect(harbourTeam.getByLabelText("Sales: Devi Nair, devi@example.test")).toBeTruthy();
      expect(harbourTeam.getByLabelText("Client: Kiran Das, kiran@example.test")).toBeTruthy();
      expect(harbourTeam.queryByTestId("project-team-person-designer")).toBeNull();

      await openTab(harbour, "Documents");
      await fireEvent.press(within(harbour.getByTestId("project-documents")).getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
      expect(mockDownload).toHaveBeenLastCalledWith(expect.objectContaining({ path: "/estimates/estimate-internal-2/pdf" }));
      await waitFor(() => expect(within(harbour.getByTestId("project-documents")).getByRole("button", { name: "Export PDF" })).not.toBeBusy());

      const harbourText = perceivableText(harbour);
      for (const value of ["35,40,000", "21,24,000", "23,60,000", "Lakeside Villa", "Asha Rao", "Ravi Kumar", "Meera Iyer", "Whitefield", "Version 3"]) expect(harbourText).not.toContain(value);
      await harbour.unmount();

      const lakeside = await renderProject(lakesideAdmin(), admin);
      expect(lakeside.getByLabelText("Client-approved value (incl. GST): ₹21,24,000, Approved")).toBeTruthy();
      expect(within(lakeside.getByTestId("project-detail-section-assignment-group-status")).getByLabelText("Project status: Active")).toBeTruthy();
      await openTab(lakeside, "Estimation");
      const lakesideEstimate = within(lakeside.getByTestId("project-estimate-panel"));
      expect(lakesideEstimate.getByLabelText("Client-approved value (incl. GST): ₹21,24,000")).toBeTruthy();
      expect(lakesideEstimate.getByLabelText("Approved estimate baseline: Version 3")).toBeTruthy();
      await openTab(lakeside, "Team");
      expect(within(lakeside.getByTestId("project-team-panel")).getByLabelText("Designer: Meera Iyer, meera@example.test")).toBeTruthy();
      await openTab(lakeside, "Documents");
      await fireEvent.press(within(lakeside.getByTestId("project-documents")).getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(2));
      expect(mockDownload).toHaveBeenLastCalledWith(expect.objectContaining({ path: "/estimates/estimate-internal-1/pdf" }));
      await waitFor(() => expect(within(lakeside.getByTestId("project-documents")).getByRole("button", { name: "Export PDF" })).not.toBeBusy());

      const lakesideText = perceivableText(lakeside);
      for (const value of ["29,50,000", "35,40,000", "23,60,000", "Harbour Loft", "Kiran Das", "Devi Nair", "Fort Kochi", "Estimation Approval", "Version 2"]) expect(lakesideText).not.toContain(value);
    });

    it.each([
      {
        name: "an unapproved estimate shows its current total and a status pill without the approval check",
        data: lakesideAdmin({ estimate: { id: "estimate-draft", status: "draft", total: 2360000 } }),
        label: "Current estimate value (incl. GST): ₹23,60,000, Draft",
        pill: "Draft",
        check: false
      },
      {
        name: "an approved estimate without a baseline never falls back to the mutable total",
        data: lakesideAdmin({ estimate: { id: "estimate-no-baseline", status: "client_approved", total: 2360000 } }),
        label: "Client-approved value (incl. GST): Approved baseline unavailable, Approved",
        pill: "Approved",
        check: true
      },
      {
        name: "no estimate shows the empty value without a pill",
        data: lakesideAdmin({ estimate: null }),
        label: "Current estimate value (incl. GST): No estimate yet",
        pill: null,
        check: false
      }
    ])("value card: $name", async ({ data, label, pill, check }) => {
      setWindow(390);
      const view = await renderProject(data, session("admin"));
      const valueCard = view.getByLabelText(label);
      expect(valueCard.props.testID).toBe("project-value-card");
      if (pill === null) {
        expect(within(valueCard).queryByTestId("project-value-pill")).toBeNull();
      } else {
        const pillView = within(within(valueCard).getByTestId("project-value-pill"));
        expect(pillView.getByText(pill)).toBeTruthy();
        expect(pillView.queryAllByTestId("glyph-check", { includeHiddenElements: true })).toHaveLength(check ? 1 : 0);
      }
      if (label.startsWith("Client-approved")) expect(perceivableText(view)).not.toContain("23,60,000");
    });

    it("shows the estimate card's empty state when the admin project has no estimate", async () => {
      setWindow(390);
      const view = await renderProject(lakesideAdmin({ estimate: null }), session("admin", [ESTIMATE_PDF]));
      expect(tabNames(view)).toEqual(["Information", "Estimation", "Team", "Tasks"]);
      await openTab(view, "Estimation");
      const estimate = within(view.getByTestId("project-estimate-panel"));
      expect(estimate.getByTestId("project-estimate-empty")).toHaveTextContent("No estimate yet");
      expect(estimate.queryByLabelText(/^Status:/)).toBeNull();
      expect(estimate.queryByLabelText(/Initial client budget range/)).toBeNull();
    });
  });

  it("renders the staff hierarchy with progress, its own facts, a client-only Team tab and the Tasks panel", async () => {
    setWindow(390);
    const view = await renderProject(palmHierarchy(), session("designer", [SELF_TASK_UPDATE]));

    expect(within(view.getByTestId("project-detail-header")).getByText("Client, schedule and progress details")).toBeTruthy();
    const valueCard = view.getByLabelText("Overall progress: 38%, On Hold");
    expect(valueCard.props.testID).toBe("project-value-card");
    expect(within(valueCard).getByTestId("glyph-progress", { includeHiddenElements: true })).toBeTruthy();
    expect(within(valueCard).queryByTestId("glyph-check", { includeHiddenElements: true })).toBeNull();

    const summary = within(view.getByTestId("project-summary-card"));
    expect(summary.getByRole("header", { name: "Palm Residency" })).toBeTruthy();
    for (const [key, label] of [
      ["client", "Client: Anil Menon"],
      ["plannedEnd", "Planned completion: 30 Jun 2026"],
      ["location", "Location: Panampilly Nagar, Kochi"],
      ["created", "Created: 20 Dec 2025"]
    ] as const) expect(summary.getByTestId(`project-summary-fact-${key}`).props.accessibilityLabel).toBe(label);
    expect(summary.queryByTestId("project-summary-fact-propertyType")).toBeNull();

    expect(tabNames(view)).toEqual(["Information", "Team", "Tasks"]);

    expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(view.getByRole("button", { name: "Schedule & progress" })).toBeExpanded();
    expect(view.queryByRole("button", { name: "Assignment & progress" })).toBeNull();
    const clientGroup = within(view.getByTestId("project-detail-section-information-group-client"));
    expect(clientGroup.getByLabelText("Client name: Anil Menon")).toBeTruthy();
    expect(clientGroup.getByLabelText("Address: 12 Marine Drive, Kochi")).toBeTruthy();
    const schedule = within(view.getByTestId("project-detail-section-schedule-body"));
    for (const label of ["Progress: 38%", "Actual start: 12 Jan 2026", "Actual completion: Not recorded", "Last updated: 02 Mar 2026"]) expect(schedule.getByLabelText(label)).toBeTruthy();
    for (const label of [/Property type/, /Client-approved/, /Current estimate/, /Initial client budget range/, /^Sales$/, /Project status/]) expect(view.queryByText(label)).toBeNull();

    await openTab(view, "Team");
    const team = within(view.getByTestId("project-team-panel"));
    expect(team.getAllByTestId(/^project-team-person-/)).toHaveLength(1);
    expect(team.getByLabelText("Client: Anil Menon, anil@example.test")).toBeTruthy();
    expect(team.queryByText("Designer")).toBeNull();
    expect(team.queryByText("Sales")).toBeNull();
    expect(team.getByTestId("project-team-person-client")).toBeTruthy();

    await openTab(view, "Tasks");
    const panel = within(view.getByTestId("project-tab-panel-tasks"));
    expect(panel.getByTestId("project-structure-panel")).toBeTruthy();
    expect(panel.getByRole("header", { name: "Floors, stages and tasks" })).toBeTruthy();
    for (const text of ["Ground floor", "First floor", "Concept mood board", "Prepare living room moodboard", "in progress · 40%", "Finalise colour palette"]) expect(panel.getByText(text)).toBeTruthy();
    for (const testID of ["floor-create:project-palm", "stage-create:floor-ground", "stage-create:floor-first", "task-create:stage-concept", "design-upload:task-moodboard", "design-upload:task-palette"]) {
      expect(panel.getByTestId(testID)).toBeTruthy();
    }
    // The task editor keeps its permission and version gates: only the versioned task offers an update.
    expect(panel.getAllByRole("button", { name: "Update task" })).toHaveLength(1);
    expect(panel.queryByRole("button", { name: "Revise deadline" })).toBeNull();
    // The bottom "Refresh project" button moved into the ⋮ menu.
    expect(view.queryByText("Refresh project")).toBeNull();

    const text = perceivableText(view);
    for (const id of ["user-designer-7", "user-manager-9", "user-site-9", "floor-ground", "stage-concept", "task-moodboard", "project-palm"]) expect(text).not.toContain(id);
  });

  it("offers the deadline revision to a staff role that holds it, and no task edits to one that holds neither", async () => {
    setWindow(390);
    const manager = await renderProject(palmHierarchy(), session("site_manager", ["design.task_deadline.update"]));
    await openTab(manager, "Tasks");
    const managerPanel = within(manager.getByTestId("project-structure-panel"));
    expect(managerPanel.getAllByRole("button", { name: "Revise deadline" })).toHaveLength(1);
    expect(managerPanel.queryByRole("button", { name: "Update task" })).toBeNull();
    await manager.unmount();

    const viewer = await renderProject(palmHierarchy(), session("site_manager"));
    await openTab(viewer, "Tasks");
    const viewerPanel = within(viewer.getByTestId("project-structure-panel"));
    expect(viewerPanel.queryByRole("button", { name: "Revise deadline" })).toBeNull();
    expect(viewerPanel.queryByRole("button", { name: "Update task" })).toBeNull();
  });

  it("limits the client view to its own schedule without team, contact, estimate or admin-only labels", async () => {
    setWindow(390);
    const view = await renderProject(gardenClientView(), session("client"));

    expect(view.getByRole("header", { name: "Garden Court" })).toBeTruthy();
    expect(within(view.getByTestId("project-detail-header")).getByText("Schedule and progress details")).toBeTruthy();
    expect(view.getByLabelText("Overall progress: 12%, Active")).toBeTruthy();
    const summary = within(view.getByTestId("project-summary-card"));
    for (const [key, label] of [
      ["plannedStart", "Planned start: 01 Apr 2026"],
      ["plannedEnd", "Planned completion: 15 Nov 2026"],
      ["location", "Location: Thrissur"],
      ["created", "Created: 10 Mar 2026"]
    ] as const) expect(summary.getByTestId(`project-summary-fact-${key}`).props.accessibilityLabel).toBe(label);
    expect(summary.queryByTestId("project-summary-fact-client")).toBeNull();
    expect(summary.queryByLabelText(/^Client:/)).toBeNull();

    expect(tabNames(view)).toEqual(["Information", "Tasks"]);
    expect(view.queryByTestId("project-tab-estimation")).toBeNull();
    expect(view.queryByTestId("project-tab-team")).toBeNull();

    expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(view.getByRole("button", { name: "Schedule & progress" })).toBeExpanded();
    expect(view.queryByTestId("project-detail-section-information-group-client")).toBeNull();

    await openTab(view, "Tasks");
    expect(within(view.getByTestId("project-structure-panel")).getByText("Garden floor")).toBeTruthy();

    for (const label of ["Client", "Client name", "Name", "Email", "Mobile", "Address", "Team members"]) expect(view.queryByText(label, { includeHiddenElements: true })).toBeNull();
    for (const label of [/Sales/, /Client-approved/, /Current estimate/, /Initial client budget range/, /Property type/, /Project status/]) {
      expect(view.queryByText(label, { includeHiddenElements: true })).toBeNull();
    }
    const text = perceivableText(view);
    for (const value of ["Stray Contact", "stray@example.test", "example.test", "₹", "Client, schedule and progress details"]) expect(text).not.toContain(value);
  });

  it("links the Client estimation tab only by the current project's exact ID", async () => {
    mockGet.mockImplementation((path: string) => Promise.resolve(path === "/client/estimates" ? clientEstimates() : versionsPayload([])));
    const client = session("client", [CLIENT_ESTIMATES]);
    const garden = await renderProject(gardenClientView(), client);
    expect(tabNames(garden)).toEqual(["Information", "Estimation", "Tasks"]);
    await openTab(garden, "Estimation");
    const gardenEstimate = within(garden.getByTestId("client-project-estimation"));
    expect(await gardenEstimate.findByText("₹4,20,000")).toBeTruthy();
    expect(gardenEstimate.queryByText("₹9,90,000")).toBeNull();
    expect(gardenEstimate.queryByText("₹7,60,000")).toBeNull();
    await fireEvent.press(gardenEstimate.getByRole("button", { name: "Open estimate estimate-garden" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/estimate/[estimateId]", params: { estimateId: "estimate-garden" } });
    await garden.unmount();

    const harbour = await renderProject({ ...gardenClientView(), id: "project-harbour", name: "Harbour House" }, client);
    await openTab(harbour, "Estimation");
    const harbourEstimate = within(harbour.getByTestId("client-project-estimation"));
    expect(await harbourEstimate.findByText("₹9,90,000")).toBeTruthy();
    expect(harbourEstimate.queryByText("₹4,20,000")).toBeNull();
    await harbour.unmount();

    const unmatched = await renderProject({ ...gardenClientView(), id: "project-unmatched" }, client);
    await openTab(unmatched, "Estimation");
    expect(await unmatched.findByText("No estimate is linked to this project yet.")).toBeTruthy();
  });

  it("opens a requested project tab when authorized and falls back when it is unavailable", async () => {
    const allowed = await renderProject(gardenClientView(), session("client", [READ_WORKFLOW]), jest.fn(), "designs");
    expect(allowed.getByRole("tab", { name: "Designs" })).toBeSelected();
    expect(allowed.getByTestId("project-tab-panel-designs")).toBeTruthy();
    await allowed.unmount();

    const denied = await renderProject(gardenClientView(), session("client"), jest.fn(), "designs");
    expect(denied.getByRole("tab", { name: "Information" })).toBeSelected();
    expect(denied.queryByRole("tab", { name: "Designs" })).toBeNull();
  });

  it("keeps Client project PDFs and approved files scoped to the matching project", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/client/estimates") return Promise.resolve(clientEstimates());
      if (path.includes("/projects/project-garden/design-versions")) return Promise.resolve(versionsPayload([
        { id: "garden-version", versionNumber: 2, originalFilename: "garden-shared.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: true },
        { id: "garden-hidden", versionNumber: 3, originalFilename: "garden-private.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: false }
      ]));
      return Promise.resolve(versionsPayload([{ id: "harbour-version", versionNumber: 1, originalFilename: "harbour-shared.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: true }]));
    });
    const client = session("client", [CLIENT_ESTIMATES, CLIENT_ESTIMATE_PDF, READ_DESIGNS, DOWNLOAD_DESIGN]);
    const garden = await renderProject(gardenClientView(), client);
    await openTab(garden, "Documents");
    const gardenDocs = within(garden.getByTestId("project-documents"));
    expect(await gardenDocs.findByText("garden-shared.pdf")).toBeTruthy();
    expect(await gardenDocs.findByLabelText("Estimate PDF, Client Approved")).toBeTruthy();
    expect(gardenDocs.queryByText("garden-private.pdf")).toBeNull();
    expect(gardenDocs.queryByText("harbour-shared.pdf")).toBeNull();
    await garden.unmount();

    const harbour = await renderProject({ ...gardenClientView(), id: "project-harbour", name: "Harbour House" }, client);
    await openTab(harbour, "Documents");
    const harbourDocs = within(harbour.getByTestId("project-documents"));
    expect(await harbourDocs.findByText("harbour-shared.pdf")).toBeTruthy();
    expect(await harbourDocs.findByLabelText("Estimate PDF, Sent To Client")).toBeTruthy();
    expect(harbourDocs.queryByText("garden-shared.pdf")).toBeNull();
  });

  it("mounts only the current project's plan, drawing and section reviews in Designs", async () => {
    mockGet.mockImplementation((path: string) => Promise.resolve(path === "/client/estimates" ? clientEstimates() : versionsPayload([])));
    const client = session("client", [CLIENT_ESTIMATES, CLIENT_PLAN_READ, CLIENT_DRAWINGS_READ, CLIENT_SECTIONS_READ]);
    const view = await renderProject(gardenClientView(), client, jest.fn(), "designs");
    expect(view.getByRole("tab", { name: "Designs" })).toBeSelected();
    expect(await view.findByTestId("plan:estimate-garden")).toBeTruthy();
    expect(view.getByTestId("drawing:estimate-garden")).toBeTruthy();
    expect(view.getByTestId("sections:project-garden")).toBeTruthy();
    expect(view.queryByTestId("plan:estimate-harbour")).toBeNull();
    expect(view.queryByTestId("drawing:estimate-pending")).toBeNull();
    await openTab(view, "Information");
    expect(view.getByTestId("project-tab-panel-designs", { includeHiddenElements: true })).toHaveStyle({ display: "none" });
    await openTab(view, "Designs");
    expect(view.getByTestId("plan:estimate-garden")).toBeTruthy();
  });

  describe("tabs", () => {
    it("swaps panels on press and keeps a visited panel's in-progress edit mounted but hidden", async () => {
      setWindow(390);
      const view = await renderProject(palmHierarchy(), session("designer", [SELF_TASK_UPDATE]));
      expect(view.queryByTestId("project-tab-panel-tasks", { includeHiddenElements: true })).toBeNull();

      // Collapse a card so the Information panel's own state can be checked after a round trip.
      await fireEvent.press(view.getByRole("button", { name: "Schedule & progress" }));
      expect(view.getByRole("button", { name: "Schedule & progress" })).toBeCollapsed();

      await openTab(view, "Tasks");
      expect(view.getByRole("tab", { name: "Information" })).not.toBeSelected();
      expect(view.getByTestId("project-tab-panel-tasks")).toBeVisible();
      const information = view.getByTestId("project-tab-panel-information", { includeHiddenElements: true });
      expect(information).toHaveStyle({ display: "none" });
      expect(information.props.importantForAccessibility).toBe("no-hide-descendants");
      expect(information.props.accessibilityElementsHidden).toBe(true);
      expect(information).not.toBeVisible();
      expect(view.queryByRole("button", { name: "Project information" })).toBeNull();

      // Start a task edit, then leave the tab.
      await fireEvent.press(within(view.getByTestId("project-structure-panel")).getByRole("button", { name: "Update task" }));
      await fireEvent.changeText(view.getByLabelText("Progress percentage"), "65");
      await fireEvent.press(view.getByRole("radio", { name: "in review" }));

      await openTab(view, "Information");
      const tasks = view.getByTestId("project-tab-panel-tasks", { includeHiddenElements: true });
      expect(tasks).toHaveStyle({ display: "none" });
      expect(tasks.props.importantForAccessibility).toBe("no-hide-descendants");
      expect(view.queryByRole("button", { name: "Save task" })).toBeNull();
      expect(view.getByRole("button", { name: "Save task", includeHiddenElements: true })).toBeTruthy();
      expect(view.getByTestId("project-tab-panel-information")).toBeVisible();
      expect(view.getByTestId("project-tab-panel-information").props.importantForAccessibility).toBe("auto");
      expect(view.getByRole("button", { name: "Schedule & progress" })).toBeCollapsed();
      expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();

      // Back on Tasks, the edit is exactly where it was left.
      await openTab(view, "Tasks");
      expect(view.getByLabelText("Progress percentage")).toHaveDisplayValue("65");
      expect(view.getByRole("radio", { name: "in review" })).toBeSelected();
      expect(view.getByRole("button", { name: "Save task" })).toBeTruthy();
      expect(view.queryByRole("button", { name: "Update task" })).toBeNull();
      expect(view.getAllByTestId(/^project-tab-panel-/, { includeHiddenElements: true }).map((panel) => panel.props.testID)).toEqual(["project-tab-panel-information", "project-tab-panel-tasks"]);
    });

    it("falls back to Information when a permission change removes the selected tab", async () => {
      setWindow(390);
      const onRefresh = jest.fn();
      const view = await renderProject(lakesideAdmin(), session("admin", [READ_DESIGNS]), onRefresh);
      expect(tabNames(view)).toEqual(ALL_TABS);

      await openTab(view, "Designs");
      const designs = within(view.getByTestId("project-tab-panel-designs"));
      expect(designs.getByTestId("design-versions:project-admin-lakeside")).toBeTruthy();
      expect(designs.getByTestId("workflow:project-admin-lakeside")).toBeTruthy();

      await view.rerender(<ProjectStructure data={lakesideAdmin()} session={session("admin")} onRefresh={onRefresh} />);
      expect(tabNames(view)).toEqual(["Information", "Estimation", "Team", "Tasks"]);
      expect(view.getByRole("tab", { name: "Information" })).toBeSelected();
      expect(view.getByTestId("project-tab-panel-information")).toBeVisible();
      expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
      expect(view.queryByTestId("project-tab-panel-designs", { includeHiddenElements: true })).toBeNull();
      expect(view.queryByTestId("design-versions:project-admin-lakeside", { includeHiddenElements: true })).toBeNull();
      expect(onRefresh).not.toHaveBeenCalled();

      // Restoring the permission brings the tab back unvisited: its panel mounts only when opened again.
      await view.rerender(<ProjectStructure data={lakesideAdmin()} session={session("admin", [READ_DESIGNS])} onRefresh={onRefresh} />);
      expect(tabNames(view)).toEqual(ALL_TABS);
      expect(view.queryByTestId("project-tab-panel-designs", { includeHiddenElements: true })).toBeNull();
      await openTab(view, "Designs");
      expect(view.getByTestId("project-tab-panel-designs")).toBeVisible();
    });

    it("falls back to Information when a refetched payload drops the selected Team tab", async () => {
      setWindow(390);
      const onRefresh = jest.fn();
      const designer = session("designer");
      const view = await renderProject(palmHierarchy(), designer, onRefresh);
      await openTab(view, "Team");

      await view.rerender(<ProjectStructure data={palmHierarchy({ clientName: null })} session={designer} onRefresh={onRefresh} />);
      expect(tabNames(view)).toEqual(["Information", "Tasks"]);
      expect(view.getByRole("tab", { name: "Information" })).toBeSelected();
      expect(view.getByTestId("project-tab-panel-information")).toBeVisible();
      expect(view.queryByTestId("project-team-panel", { includeHiddenElements: true })).toBeNull();
    });
  });

  describe("Designs and Documents permission matrix", () => {
    it.each([
      { name: "admin without design or PDF permissions", data: lakesideAdmin, role: "admin", permissions: [], tabs: ["Information", "Estimation", "Team", "Tasks"] },
      { name: "admin with design workflow read only", data: lakesideAdmin, role: "admin", permissions: [READ_WORKFLOW], tabs: ["Information", "Estimation", "Designs", "Team", "Tasks"] },
      { name: "admin with estimate PDF only", data: lakesideAdmin, role: "admin", permissions: [ESTIMATE_PDF], tabs: ["Information", "Estimation", "Documents", "Team", "Tasks"] },
      { name: "admin with design version read only", data: lakesideAdmin, role: "admin", permissions: [READ_DESIGNS], tabs: [...ALL_TABS] },
      { name: "super admin with every read", data: lakesideAdmin, role: "super_admin", permissions: [...ADMIN_READS], tabs: [...ALL_TABS] },
      { name: "staff designer with design version read", data: palmHierarchy, role: "designer", permissions: [READ_DESIGNS], tabs: ["Information", "Designs", "Documents", "Team", "Tasks"] },
      { name: "staff designer with estimate PDF (staff payload has no estimate)", data: palmHierarchy, role: "designer", permissions: [ESTIMATE_PDF], tabs: ["Information", "Team", "Tasks"] },
      { name: "client with design workflow read only", data: gardenClientView, role: "client", permissions: [READ_WORKFLOW], tabs: ["Information", "Designs", "Tasks"] }
    ] as const)("$name", async ({ data, role, permissions, tabs }) => {
      setWindow(390);
      const view = await renderProject(data(), session(role, permissions));
      expect(tabNames(view)).toEqual(tabs);
    });

    it("renders the existing design and workflow workspaces, in order, for the project's own id", async () => {
      setWindow(390);
      const view = await renderProject(palmHierarchy(), session("designer", [READ_DESIGNS]));
      expect(view.queryByTestId("design-versions:project-palm", { includeHiddenElements: true })).toBeNull();
      await openTab(view, "Designs");
      const designs = within(view.getByTestId("project-tab-panel-designs"));
      expect(designs.getByTestId("design-versions:project-palm")).toBeTruthy();
      expect(designs.getByTestId("workflow:project-palm")).toBeTruthy();
      expectInDocumentOrder(view, ["#project-tab-panel-designs", "#design-versions:project-palm", "#workflow:project-palm"]);
    });

    it("lists only the estimate PDF with the PDF permission and fetches no design versions", async () => {
      setWindow(390);
      mockDownload.mockImplementation(() => ({ result: Promise.resolve(sharedArtifact()), cancel: jest.fn() }));
      const view = await renderProject(lakesideAdmin(), session("admin", [ESTIMATE_PDF]));
      await openTab(view, "Documents");
      const documents = within(view.getByTestId("project-documents"));
      expect(documents.getByLabelText("Estimate PDF, Client Approved")).toBeTruthy();
      expect(documents.queryByRole("header", { name: "Approved design files" })).toBeNull();
      expect(mockGet).not.toHaveBeenCalled();

      await fireEvent.press(documents.getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
      expect(mockDownload).toHaveBeenCalledWith({ path: "/estimates/estimate-internal-1/pdf", fileName: "lisno-estimate-estimate-internal-1.pdf", mimeType: "application/pdf", maxBytes: 25 * 1024 * 1024 });
      await waitFor(() => expect(documents.getByRole("button", { name: "Export PDF" })).not.toBeBusy());
    });

    it("lists only approved design files with design read, and offers Download only with the download permission", async () => {
      setWindow(390);
      mockGet.mockResolvedValue(LAKESIDE_VERSIONS);
      const reader = await renderProject(lakesideAdmin(), session("admin", [READ_DESIGNS]));
      expect(mockGet).not.toHaveBeenCalled();
      await openTab(reader, "Documents");
      const readerDocs = within(reader.getByTestId("project-documents"));
      expect(await readerDocs.findByText("lakeside-living-room.pdf")).toBeTruthy();
      expect(mockGet).toHaveBeenCalledWith("/projects/project-admin-lakeside/design-versions?limit=30&offset=0", expect.anything());
      expect(readerDocs.getByRole("header", { name: "Approved design files" })).toBeTruthy();
      expect(readerDocs.queryByText("lakeside-kitchen-pending.pdf")).toBeNull();
      expect(readerDocs.queryByText("Estimate PDF")).toBeNull();
      expect(readerDocs.queryByRole("button", { name: "Download" })).toBeNull();
      await reader.unmount();

      const downloader = await renderProject(lakesideAdmin(), session("admin", [READ_DESIGNS, DOWNLOAD_DESIGN]));
      await openTab(downloader, "Documents");
      const downloaderDocs = within(downloader.getByTestId("project-documents"));
      expect(await downloaderDocs.findByText("lakeside-living-room.pdf")).toBeTruthy();
      expect(downloaderDocs.getAllByRole("button", { name: "Download" })).toHaveLength(1);
    });
  });

  describe("⋮ project actions menu", () => {
    it("opens expanded, refreshes once and closes, and hides Project messages without the messages feature", async () => {
      setWindow(390);
      const onRefresh = jest.fn();
      const view = await renderProject(lakesideAdmin(), session("admin"), onRefresh);
      expect(view.queryByTestId("project-actions-menu", { includeHiddenElements: true })).toBeNull();

      await fireEvent.press(view.getByRole("button", { name: "More project actions" }));
      expect(view.getByRole("button", { name: "More project actions" })).toBeExpanded();
      const menu = within(actionsMenu(view));
      expect(menu.getAllByRole("menuitem").map((item) => item.props.accessibilityLabel)).toEqual(["Refresh project"]);
      expect(view.queryByText("Project messages", { includeHiddenElements: true })).toBeNull();

      await fireEvent.press(menu.getByRole("menuitem", { name: "Refresh project" }));
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId("project-actions-menu", { includeHiddenElements: true })).toBeNull();
      expect(view.getByRole("button", { name: "More project actions" })).toBeCollapsed();
      expect(mockPush).not.toHaveBeenCalled();
      // No separate Refresh button remains on the page.
      expect(view.queryByText("Refresh project", { includeHiddenElements: true })).toBeNull();
    });

    it("shows Project messages only with the messages feature and opens each project's own thread", async () => {
      setWindow(390);
      for (const [data, id] of [[lakesideAdmin(), "project-admin-lakeside"], [harbourAdmin(), "project-admin-harbour"]] as const) {
        mockPush.mockReset();
        const onRefresh = jest.fn();
        const view = await renderProject(data, session("admin", [READ_CHAT]), onRefresh);
        await fireEvent.press(view.getByRole("button", { name: "More project actions" }));
        const menu = within(actionsMenu(view));
        expect(menu.getAllByRole("menuitem").map((item) => item.props.accessibilityLabel)).toEqual(["Refresh project", "Project messages"]);

        await fireEvent.press(menu.getByRole("menuitem", { name: "Project messages" }));
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: id } });
        expect(onRefresh).not.toHaveBeenCalled();
        expect(view.queryByTestId("project-actions-menu", { includeHiddenElements: true })).toBeNull();
        expect(view.getByRole("button", { name: "More project actions" })).toBeCollapsed();
        await view.unmount();
      }

      // A stale snapshot (policy version mismatch) never resolves the messages feature, even with chat.read.
      const stale = { ...session("admin", [READ_CHAT]), authorization: { role: "admin", policyVersion: "stale-policy", permissions: [READ_CHAT] } } as unknown as AuthenticatedSession;
      const staleView = await renderProject(lakesideAdmin(), stale);
      await fireEvent.press(staleView.getByRole("button", { name: "More project actions" }));
      expect(within(actionsMenu(staleView)).getAllByRole("menuitem").map((item) => item.props.accessibilityLabel)).toEqual(["Refresh project"]);
    });

    it("closes on backdrop press and on Android back without refreshing or navigating", async () => {
      setWindow(390);
      const onRefresh = jest.fn();
      const view = await renderProject(lakesideAdmin(), session("admin", [READ_CHAT]), onRefresh);

      await fireEvent.press(view.getByRole("button", { name: "More project actions" }));
      const backdrop = view.getByTestId("project-actions-backdrop", { includeHiddenElements: true });
      expect(backdrop.props.accessibilityLabel).toBe("Close project actions");
      await fireEvent.press(backdrop);
      expect(view.queryByTestId("project-actions-menu", { includeHiddenElements: true })).toBeNull();
      expect(view.getByRole("button", { name: "More project actions" })).toBeCollapsed();

      await fireEvent.press(view.getByRole("button", { name: "More project actions" }));
      expect(actionsMenu(view)).toBeTruthy();
      await act(async () => view.getByTestId("project-actions-modal", { includeHiddenElements: true }).props.onRequestClose());
      expect(view.queryByTestId("project-actions-menu", { includeHiddenElements: true })).toBeNull();
      expect(view.getByRole("button", { name: "More project actions" })).toBeCollapsed();

      expect(onRefresh).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("collapses and restores a detail section from its header", async () => {
    setWindow(390);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));
    const header = () => view.getByRole("button", { name: "Project information" });
    expect(header().props.accessibilityHint).toBe("Client, property and budget details");
    expect(within(header()).getByTestId("glyph-chevronUp", { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(header());
    expect(header()).toBeCollapsed();
    expect(within(header()).getByTestId("glyph-chevronDown", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("project-detail-section-information-body", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByLabelText("Email: asha@example.test")).toBeNull();
    expect(view.getByTestId("project-detail-section-assignment-body")).toBeTruthy();
    expect(view.getByRole("button", { name: "Assignment & progress" })).toBeExpanded();

    await fireEvent.press(header());
    expect(header()).toBeExpanded();
    expect(view.getByTestId("project-detail-section-information-body")).toBeTruthy();
    expect(view.getByLabelText("Email: asha@example.test")).toBeTruthy();
  });

  it("places detail groups two per row on wide cards and follows the measured card width", async () => {
    setWindow(1024);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));
    const body = () => view.getByTestId("project-detail-section-information-body");
    expect(body()).toHaveStyle({ flexDirection: "row", flexWrap: "wrap" });
    expect(view.getByTestId("project-detail-section-information-group-project")).toHaveStyle({ flexBasis: "45%" });
    expect(view.getByTestId("project-detail-section-assignment-group-status")).toHaveStyle({ flexBasis: "100%" });
    const location = within(body()).getByLabelText("Location: Whitefield, Bengaluru");
    expect(rowCopy(location, "Location")).toHaveStyle({ flexDirection: "row" });

    await fireEvent(view.getByTestId("project-detail-sections"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 520, height: 600 } } });
    expect(body()).not.toHaveStyle({ flexDirection: "row" });
    expect(flatStyle(view.getByTestId("project-detail-section-information-group-project")).flexBasis).toBeUndefined();
  });

  it("keeps every panel usable at 320 wide with text scaled to 2x", async () => {
    setWindow(320, 2);
    mockGet.mockResolvedValue(versionsPayload([
      { id: "version-long", versionNumber: 12, originalFilename: "lakeside-villa-ground-floor-living-dining-and-garden-pavilion-final-approved-drawing-set.pdf", mimeType: "application/pdf", approvalStatus: "approved", approvedAt: "2026-09-05T10:00:00.000Z" }
    ]));
    const longName = "Lakeside Villa renovation with an extended garden pavilion and guest wing";
    const longEmail = "asha.rao.family.residence.long.address@example-client-domain.test";
    const view = await renderProject(
      lakesideAdmin({ name: longName, client: { name: "Asha Rao", email: longEmail, mobile: "+91 90000 00001" } }),
      session("super_admin", [...ADMIN_READS, DOWNLOAD_DESIGN])
    );

    expect(view.getByRole("header", { name: longName })).toBeTruthy();
    for (const title of ["Project information", "Assignment & progress"]) expect(view.getByRole("button", { name: title })).toBeExpanded();

    // Summary: thumbnail on top at full width; facts one per row with no vertical divider.
    expect(view.getByTestId("project-summary-card")).toHaveStyle({ flexDirection: "column" });
    expect(view.getByTestId("project-summary-thumbnail", { includeHiddenElements: true })).toHaveStyle({ width: "100%" });
    for (const key of ["client", "propertyType", "location", "created"]) {
      const fact = view.getByTestId(`project-summary-fact-${key}`);
      expect(flatStyle(fact).borderLeftWidth).toBeUndefined();
      expect(fact.parent).not.toHaveStyle({ flexDirection: "row" });
    }

    // Value card: the amount and pill stack under the label instead of squeezing beside it.
    expect(view.getByTestId("project-value-card")).toHaveStyle({ flexDirection: "column" });

    // Information rows stack their label above the value; groups stay one per row.
    const informationBody = view.getByTestId("project-detail-section-information-body");
    expect(informationBody).not.toHaveStyle({ flexDirection: "row" });
    expect(rowCopy(within(informationBody).getByLabelText("Location: Whitefield, Bengaluru"), "Location")).toHaveStyle({ flexDirection: "column" });
    expect(rowCopy(within(informationBody).getByLabelText(`Email: ${longEmail}`), "Email")).toHaveStyle({ flexDirection: "column" });

    // The tab strip scrolls horizontally instead of widening the page.
    let strip = tabList(view).parent;
    while (strip && strip.props.horizontal !== true) strip = strip.parent;
    expect(strip?.props.horizontal).toBe(true);

    // Mount every panel so the overflow and truncation scans cover all of them.
    for (const name of ALL_TABS.slice(1)) await openTab(view, name);
    expect(await within(view.getByTestId("project-documents", { includeHiddenElements: true })).findByText(/final-approved-drawing-set\.pdf$/, { includeHiddenElements: true })).toBeTruthy();
    expect(view.getAllByTestId(/^project-tab-panel-/, { includeHiddenElements: true })).toHaveLength(ALL_TABS.length);

    // No fixed dimension wider than the 320 viewport anywhere in the tree.
    const tooWide: string[] = [];
    const truncated: string[] = [];
    let widest = 0;
    walk(view.toJSON() as RenderedNode | null, (node) => {
      if (typeof node === "string") return;
      const style = flatStyle(node);
      for (const key of ["width", "minWidth", "flexBasis"]) {
        const value = style[key];
        if (typeof value !== "number") continue;
        widest = Math.max(widest, value);
        if (value > 320) tooWide.push(`${String(node.props.testID ?? node.type)}.${key}=${value}`);
      }
      if (node.type === "Text" && node.props.numberOfLines !== undefined) truncated.push(JSON.stringify(node.children));
    });
    // The scan really reads fixed dimensions (for example the 200 wide decorative leaves)...
    expect(widest).toBeGreaterThanOrEqual(200);
    // ...and none of them exceeds the viewport.
    expect(tooWide).toEqual([]);
    // No text is truncated to fit: names, titles, values and file names wrap.
    expect(truncated).toEqual([]);
  });

  it("renders nothing when the payload is not a project record", async () => {
    setWindow(360);
    for (const data of [null, undefined, "project", []]) {
      const view = await renderProject(data, session("super_admin"));
      expect(view.toJSON()).toBeNull();
      await view.unmount();
    }
  });
});

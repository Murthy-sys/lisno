import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import * as Native from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ProjectStructure } from "./ProjectStructure";

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
  useConfiguredRuntime: () => ({ runtime: { api: { authenticated: { patch: () => Promise.resolve(null), post: () => Promise.resolve(null) } } } })
}));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => async () => undefined }));

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

/**
 * `import * as Native` yields a namespace copy, so spying on it would not reach the component. The
 * react-native index re-reads this module's default export on every access, so spy on it directly.
 */
const windowDimensions = require("react-native/Libraries/Utilities/useWindowDimensions") as { default: typeof Native.useWindowDimensions };

function setWindow(width: number, fontScale = 1) {
  jest.spyOn(windowDimensions, "default").mockReturnValue({ width, height: 900, scale: 1, fontScale });
}

async function renderProject(data: unknown, activeSession: AuthenticatedSession, onRefresh: () => void = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<ProjectStructure data={data} session={activeSession} onRefresh={onRefresh} />, { wrapper });
}

type RenderedView = Awaited<ReturnType<typeof renderProject>>;
type RenderedNode = string | { readonly type: string; readonly props: Record<string, unknown>; readonly children: readonly RenderedNode[] | null };

function walk(node: RenderedNode | null, visit: (node: Exclude<RenderedNode, string> | string) => void) {
  if (node === null) return;
  visit(node);
  if (typeof node !== "string") for (const child of node.children ?? []) walk(child, visit);
}

/** Document-order tokens: `#testID` for identified elements, plus every text child. */
function documentOrder(view: RenderedView): readonly string[] {
  const tokens: string[] = [];
  walk(view.toJSON(), (node) => {
    if (typeof node === "string") tokens.push(node);
    else if (typeof node.props.testID === "string") tokens.push(`#${node.props.testID}`);
  });
  return tokens;
}

/** Everything a sighted or screen-reader user can perceive: text children, accessibility labels and hints. */
function perceivableText(view: RenderedView): string {
  const values: string[] = [];
  walk(view.toJSON(), (node) => {
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

function expectNoReferenceOnlyUi(view: RenderedView) {
  expect(view.queryAllByRole("tab")).toHaveLength(0);
  expect(view.queryByText(/\bmessages?\b/i)).toBeNull();
  expect(view.queryByText(/\bedit\b/i)).toBeNull();
  expect(view.queryByText(/\bmore\b/i)).toBeNull();
  expect(view.queryByText("Assign Designer")).toBeNull();
  expect(view.queryByRole("button", { name: /assign designer|messages|edit|more/i })).toBeNull();
}

describe("ProjectStructure project detail page", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders the admin reference composition in two columns at tablet width", async () => {
    setWindow(1024);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));

    expect(view.getByTestId("project-detail-layout-two-column")).toBeTruthy();
    expect(view.queryByTestId("project-detail-layout-single")).toBeNull();

    const hero = within(view.getByTestId("project-detail-hero"));
    expect(hero.getByTestId("content-back")).toBeTruthy();
    expect(hero.getByText("PROJECT")).toBeTruthy();
    expect(hero.getByRole("header", { name: "Lakeside Villa" })).toBeTruthy();
    expect(hero.getByLabelText("Status: Active")).toBeTruthy();
    expect(hero.getByText("Active")).toBeTruthy();
    expect(hero.getByText("Project ID: project-admin-lakeside")).toBeTruthy();
    expect(hero.getByText("Created 22 Sep 2026")).toBeTruthy();

    const facts = within(view.getByTestId("project-detail-facts"));
    expect(facts.getByLabelText("Client: Asha Rao")).toBeTruthy();
    expect(facts.getByLabelText("Location: Whitefield, Bengaluru")).toBeTruthy();
    expect(facts.getByLabelText("Property type: Villa")).toBeTruthy();
    expect(facts.getByLabelText("Created: 22 Sep 2026")).toBeTruthy();
    expect(facts.getByLabelText("Client-approved value (incl. GST): ₹21,24,000")).toBeTruthy();
    expect(facts.getByText("Client-approved value (incl. GST)")).toBeTruthy();

    const text = perceivableText(view);
    expect(text).not.toContain("23,60,000");
    expect(text).toContain("₹21,24,000");

    const information = view.getByRole("button", { name: "Project information" });
    const assignment = view.getByRole("button", { name: "Assignment & progress" });
    expect(information).toBeExpanded();
    expect(assignment).toBeExpanded();
    const informationBody = within(view.getByTestId("project-detail-section-information-body"));
    expect(informationBody.getByLabelText("Initial client budget range: ₹12,00,000 – ₹18,00,000")).toBeTruthy();
    expect(informationBody.getByLabelText("Email: asha@example.test")).toBeTruthy();
    expect(informationBody.getByLabelText("Mobile: +91 90000 00001")).toBeTruthy();
    const assignmentBody = within(view.getByTestId("project-detail-section-assignment-body"));
    expect(assignmentBody.getByLabelText("Assigned to: Ravi Kumar")).toBeTruthy();
    expect(assignmentBody.getByLabelText("Next action: Share revised moodboard")).toBeTruthy();
    expect(assignmentBody.getByLabelText("Client-approved value (incl. GST): ₹21,24,000")).toBeTruthy();
    expect(assignmentBody.getByLabelText("Approved estimate baseline: Version 3")).toBeTruthy();

    const main = within(view.getByTestId("project-detail-main"));
    const side = within(view.getByTestId("project-detail-side"));
    expect(main.queryByText("Quick summary")).toBeNull();
    expect(side.getByRole("header", { name: "Quick summary" })).toBeTruthy();
    expect(side.getByLabelText("Project status: Active")).toBeTruthy();
    expect(side.getByLabelText("Estimate status: Client Approved")).toBeTruthy();
    expect(side.getByLabelText("Client-approved value (incl. GST): ₹21,24,000")).toBeTruthy();
    expect(side.getByLabelText("Initial client budget range: ₹12,00,000 – ₹18,00,000")).toBeTruthy();

    const figure = within(view.getByTestId("project-detail-figure"));
    expect(figure.getByText("Interior reference")).toBeTruthy();
    expect(figure.getByText("Illustrative artwork")).toBeTruthy();
    expect(side.getByTestId("project-detail-figure")).toBeTruthy();

    const team = within(view.getByTestId("project-detail-team"));
    expect(team.getByRole("header", { name: "Team members" })).toBeTruthy();
    expect(team.getByLabelText("Sales: Ravi Kumar, ravi@example.test")).toBeTruthy();
    expect(team.getByLabelText("Designer: Meera Iyer, meera@example.test")).toBeTruthy();
    expect(team.getByLabelText("Client: Asha Rao, asha@example.test")).toBeTruthy();

    expect(main.getByTestId("project-structure-panel")).toBeTruthy();
    expect(main.getByTestId("floor-create:project-admin-lakeside")).toBeTruthy();
    expect(main.getByText("No project structure is available for this account.")).toBeTruthy();
    expect(main.getByTestId("design-versions:project-admin-lakeside")).toBeTruthy();
    expect(main.getByTestId("workflow:project-admin-lakeside")).toBeTruthy();
    expect(main.getByRole("button", { name: "Refresh project" })).toBeTruthy();
    expect(side.queryByTestId("project-structure-panel")).toBeNull();
  });

  it("shows Estimation Approval and a second project's own values without cross-contamination", async () => {
    setWindow(1024);
    const view = await renderProject(harbourAdmin(), session("admin"));

    const hero = within(view.getByTestId("project-detail-hero"));
    expect(hero.getByRole("header", { name: "Harbour Loft" })).toBeTruthy();
    expect(hero.getByLabelText("Status: Estimation Approval")).toBeTruthy();
    expect(hero.getByText("Project ID: project-admin-harbour")).toBeTruthy();
    expect(hero.getByText("Created 03 Aug 2026")).toBeTruthy();
    expect(view.getAllByText("Estimation Approval")).toHaveLength(2);

    const facts = within(view.getByTestId("project-detail-facts"));
    expect(facts.getByLabelText("Client-approved value (incl. GST): ₹29,50,000")).toBeTruthy();
    expect(facts.getByLabelText("Property type: Apartment")).toBeTruthy();
    const informationBody = within(view.getByTestId("project-detail-section-information-body"));
    expect(informationBody.getByLabelText("Mobile: Not captured")).toBeTruthy();
    expect(within(view.getByTestId("project-detail-section-assignment-body")).getByLabelText("Next action: Assign Designer to upload design")).toBeTruthy();

    const team = within(view.getByTestId("project-detail-team"));
    expect(team.getByLabelText("Sales: Devi Nair, devi@example.test")).toBeTruthy();
    expect(team.getByLabelText("Client: Kiran Das, kiran@example.test")).toBeTruthy();
    expect(team.queryByText("Designer")).toBeNull();

    const text = perceivableText(view);
    for (const value of ["35,40,000", "21,24,000", "Lakeside Villa", "Asha Rao", "Meera Iyer", "project-admin-lakeside"]) expect(text).not.toContain(value);
    expectNoReferenceOnlyUi(view);
    expect(view.getAllByRole("button")).toHaveLength(3);
  });

  it("collapses and restores a detail section from its header", async () => {
    setWindow(1024);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));

    await fireEvent.press(view.getByRole("button", { name: "Project information" }));
    expect(view.queryByTestId("project-detail-section-information-body")).toBeNull();
    expect(view.getByRole("button", { name: "Project information" })).toBeCollapsed();
    expect(view.queryByLabelText("Email: asha@example.test")).toBeNull();
    expect(view.getByTestId("project-detail-section-assignment-body")).toBeTruthy();
    expect(view.getByRole("button", { name: "Assignment & progress" })).toBeExpanded();

    await fireEvent.press(view.getByRole("button", { name: "Project information" }));
    expect(view.getByTestId("project-detail-section-information-body")).toBeTruthy();
    expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(view.getByLabelText("Email: asha@example.test")).toBeTruthy();
  });

  it("places detail groups two per row on wide cards and follows the measured card width", async () => {
    setWindow(1024);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));
    const body = () => view.getByTestId("project-detail-section-information-body");
    expect(body()).toHaveStyle({ flexDirection: "row" });
    expect(within(body()).getByLabelText("Location: Whitefield, Bengaluru")).toHaveStyle({ flexDirection: "row" });

    await fireEvent(view.getByTestId("project-detail-sections"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 520, height: 600 } } });
    expect(body()).not.toHaveStyle({ flexDirection: "row" });
  });

  it("renders the staff hierarchy in one column with the operational content after the summary", async () => {
    setWindow(360);
    const view = await renderProject(palmHierarchy(), session("designer", ["design.task.self.update"]));

    expect(view.getByTestId("project-detail-layout-single")).toBeTruthy();
    expect(view.queryByTestId("project-detail-layout-two-column")).toBeNull();
    expect(view.queryByTestId("project-detail-side")).toBeNull();
    expect(view.queryByTestId("project-detail-figure")).toBeNull();
    expect(view.queryByText("Illustrative artwork")).toBeNull();

    const hero = within(view.getByTestId("project-detail-hero"));
    expect(hero.getByRole("header", { name: "Palm Residency" })).toBeTruthy();
    expect(hero.getByLabelText("Status: On Hold")).toBeTruthy();
    expect(hero.getByText("Project ID: project-palm")).toBeTruthy();
    expect(hero.getByText("Created 20 Dec 2025")).toBeTruthy();

    const facts = within(view.getByTestId("project-detail-facts"));
    expect(facts.getByLabelText("Client: Anil Menon")).toBeTruthy();
    expect(facts.getByLabelText("Location: Panampilly Nagar, Kochi")).toBeTruthy();
    expect(facts.getByLabelText("Progress: 38%")).toBeTruthy();
    expect(facts.getByLabelText("Planned completion: 30 Jun 2026")).toBeTruthy();
    expect(facts.queryByText(/Property type|Client-approved|Current estimate/)).toBeNull();

    expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(view.getByRole("button", { name: "Schedule & progress" })).toBeExpanded();
    expect(view.queryByRole("button", { name: "Assignment & progress" })).toBeNull();
    const schedule = within(view.getByTestId("project-detail-section-schedule-body"));
    expect(schedule.getByLabelText("Actual start: 12 Jan 2026")).toBeTruthy();
    expect(schedule.getByLabelText("Actual completion: Not recorded")).toBeTruthy();
    expect(schedule.getByLabelText("Last updated: 02 Mar 2026")).toBeTruthy();

    const team = within(view.getByTestId("project-detail-team"));
    expect(team.getByLabelText("Client: Anil Menon, anil@example.test")).toBeTruthy();
    expect(team.queryByText("Designer")).toBeNull();
    expect(team.queryByText("Sales")).toBeNull();

    const panel = within(view.getByTestId("project-structure-panel"));
    expect(panel.getByRole("header", { name: "Floors, stages and tasks" })).toBeTruthy();
    expect(panel.getByText("Ground floor")).toBeTruthy();
    expect(panel.getByText("First floor")).toBeTruthy();
    expect(panel.getByText("Concept mood board")).toBeTruthy();
    expect(panel.getByText("Prepare living room moodboard")).toBeTruthy();
    expect(panel.getByText("in progress · 40%")).toBeTruthy();
    expect(panel.getByText("Finalise colour palette")).toBeTruthy();
    expect(panel.getByTestId("floor-create:project-palm")).toBeTruthy();
    expect(panel.getByTestId("stage-create:floor-ground")).toBeTruthy();
    expect(panel.getByTestId("stage-create:floor-first")).toBeTruthy();
    expect(panel.getByTestId("task-create:stage-concept")).toBeTruthy();
    expect(panel.getByTestId("design-upload:task-moodboard")).toBeTruthy();
    expect(panel.getByTestId("design-upload:task-palette")).toBeTruthy();
    // The task editor keeps its permission and version gates: only the versioned task offers an update.
    expect(panel.getAllByRole("button", { name: "Update task" })).toHaveLength(1);
    expect(panel.queryByRole("button", { name: "Revise deadline" })).toBeNull();

    const text = perceivableText(view);
    for (const id of ["user-designer-7", "user-manager-9", "user-site-9", "floor-ground", "stage-concept", "task-moodboard"]) expect(text).not.toContain(id);

    const tokens = documentOrder(view);
    const order = [
      position(tokens, "#project-detail-hero"),
      position(tokens, "#project-detail-facts"),
      position(tokens, "#project-detail-sections"),
      position(tokens, "#project-detail-aside"),
      position(tokens, "Quick summary"),
      position(tokens, "#project-structure-panel"),
      position(tokens, "#design-versions:project-palm"),
      position(tokens, "#workflow:project-palm"),
      position(tokens, "Refresh project")
    ];
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(within(view.getByTestId("project-detail-main")).getByTestId("project-detail-aside")).toBeTruthy();
  });

  it("limits the client view to its own schedule without team, contact or admin-only labels", async () => {
    setWindow(390);
    const view = await renderProject(gardenClientView(), session("client"));

    expect(view.getByRole("header", { name: "Garden Court" })).toBeTruthy();
    expect(view.getByText("Your project schedule and progress.")).toBeTruthy();
    const facts = within(view.getByTestId("project-detail-facts"));
    expect(facts.getByLabelText("Location: Thrissur")).toBeTruthy();
    expect(facts.getByLabelText("Created: 10 Mar 2026")).toBeTruthy();
    expect(facts.getByLabelText("Progress: 12%")).toBeTruthy();
    expect(facts.getByLabelText("Planned completion: 15 Nov 2026")).toBeTruthy();
    expect(facts.queryByLabelText(/^Client:/)).toBeNull();

    expect(view.getByRole("button", { name: "Project information" })).toBeExpanded();
    expect(view.getByRole("button", { name: "Schedule & progress" })).toBeExpanded();
    expect(view.getByRole("header", { name: "Quick summary" })).toBeTruthy();
    expect(view.queryByTestId("project-detail-team")).toBeNull();
    expect(view.queryByText("Team members")).toBeNull();

    for (const label of ["Client", "Name", "Email", "Mobile", "Address"]) expect(view.queryByText(label)).toBeNull();
    for (const label of [/Sales/, /Client-approved/, /Current estimate/, /Initial client budget range/, /Property type/]) expect(view.queryByText(label)).toBeNull();
    const text = perceivableText(view);
    for (const value of ["Stray Contact", "stray@example.test", "example.test", "₹"]) expect(text).not.toContain(value);
    expect(within(view.getByTestId("project-structure-panel")).getByText("Garden floor")).toBeTruthy();
  });

  it("keeps the page usable at 320 wide with text scaled to 2x", async () => {
    setWindow(320, 2);
    const longName = "Lakeside Villa renovation with an extended garden pavilion and guest wing";
    const view = await renderProject(lakesideAdmin({ name: longName }), session("super_admin"));

    expect(view.getByTestId("project-detail-layout-single")).toBeTruthy();
    expect(view.queryByTestId("project-detail-figure")).toBeNull();
    expect(view.getByRole("header", { name: longName })).toBeTruthy();
    for (const title of ["Project information", "Assignment & progress"]) {
      expect(view.getByRole("button", { name: title })).toBeExpanded();
    }
    expect(view.getByRole("header", { name: "Quick summary" })).toBeTruthy();
    expect(view.getByRole("header", { name: "Team members" })).toBeTruthy();

    // Tiles take a full row and label/value rows stack instead of squeezing side by side.
    expect(within(view.getByTestId("project-detail-facts")).getByLabelText("Client: Asha Rao")).toHaveStyle({ flexBasis: "100%" });
    expect(within(view.getByTestId("project-detail-section-information-body")).getByLabelText("Location: Whitefield, Bengaluru")).toHaveStyle({ flexDirection: "column" });
    expect(within(view.getByTestId("project-detail-aside")).getByLabelText("Project status: Active")).toHaveStyle({ flexDirection: "column" });
    expect(view.getByTestId("project-detail-section-information-body")).not.toHaveStyle({ flexDirection: "row" });

    // No text is truncated to fit.
    const truncated: string[] = [];
    walk(view.toJSON(), (node) => {
      if (typeof node !== "string" && node.type === "Text" && node.props.numberOfLines !== undefined) truncated.push(JSON.stringify(node.children));
    });
    expect(truncated).toEqual([]);
  });

  it("shows no reference-only tabs or header actions for the admin payload", async () => {
    setWindow(1024);
    const view = await renderProject(lakesideAdmin(), session("super_admin"));
    expectNoReferenceOnlyUi(view);
    const buttons = view.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(view.getByRole("button", { name: "Project information" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Assignment & progress" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Refresh project" })).toBeTruthy();
  });

  it("renders nothing when the payload is not a project record", async () => {
    setWindow(360);
    for (const data of [null, undefined, "project", []]) {
      const view = await renderProject(data, session("super_admin"));
      expect(view.toJSON()).toBeNull();
      await view.unmount();
    }
  });

  it("calls onRefresh when Refresh project is pressed", async () => {
    setWindow(360);
    const onRefresh = jest.fn();
    const view = await renderProject(palmHierarchy({ id: "project-refresh", name: "Refresh Test Home" }), session("site_manager"), onRefresh);
    await fireEvent.press(view.getByRole("button", { name: "Refresh project" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

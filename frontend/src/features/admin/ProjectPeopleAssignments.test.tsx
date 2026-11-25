import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { AdminProjectSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectPeopleAssignments, type ProjectAssignmentArea } from "./ProjectPeopleAssignments";

function project(id = "project-a"): AdminProjectSummary {
  return {
    id, name: id === "project-a" ? "Courtyard home" : "Garden home", status: "planning", location: "Pune",
    client: { name: "Sample Client", email: "client@example.test", mobile: "9000000000" },
    propertyType: "Villa", budgetMin: null, budgetMax: null, estimator: null, lead: null,
    estimationWorkflowVersion: 3, createdAt: "2026-11-01T00:00:00Z",
    estimate: {
      id: `estimate-${id}`, leadId: `lead-${id}`, projectId: id, resolvedProjectId: id,
      projectLinkSource: "estimate_and_lead", version: 2, status: "client_approved",
      subtotal: 1000, gst: 180, total: 1180, clientDecisionAt: "2026-11-10T00:00:00Z",
      clientDecisionSource: "client_portal", approvedBaseline: {
        estimateVersion: 1, reviewRoundId: "initial-round", subtotal: 1000, gst: 180, total: 1180,
        decisionAt: "2026-11-10T00:00:00Z", decisionSource: "client_portal"
      },
      initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 1, approvedAt: "2026-11-10T00:00:00Z" },
      designPlanStatus: "assigned", designPlanVersion: 1, canAssignDesigner: true,
      designPlanDesigner: { id: "designer-one", name: "First Designer", email: "designer@example.test" }
    }
  };
}

function installApi() {
  const reads = { designers: 0, workers: 0, tasks: 0, identities: [] as string[], managers: 0, sections: 0 };
  server.use(
    http.get("/api/v1/admin/designers", () => {
      reads.designers++;
      return HttpResponse.json({ data: [
        { id: "designer-one", name: "First Designer", email: "designer@example.test" },
        { id: "designer-two", name: "Second Designer", email: "designer-two@example.test" }
      ] });
    }),
    http.get("/api/v1/admin/workers", () => {
      reads.workers++;
      return HttpResponse.json({ data: [
        { id: "procurement-one", role: "procurement", name: "Procurement person", email: "procurement@example.test" },
        { id: "manager-one", role: "site_manager", name: "Project Manager person", email: "manager@example.test" }
      ] });
    }),
    http.get("/api/v1/admin/projects/:id/workflow-tasks", ({ params }) => {
      reads.tasks++;
      return HttpResponse.json({ data: [{
        id: `procurement-${params.id}`, projectId: params.id, projectName: "Sample home", estimateId: `estimate-${params.id}`,
        kind: "procurement", title: "Procurement coordination", assigneeRole: "procurement", assignedWorker: null,
        description: "", sourceSectionId: null, roomName: null, status: "open", progress: 0, version: 1,
        openedAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z"
      }] });
    }),
    http.get("/api/v1/admin/projects/:id/section-assignments", () => {
      reads.sections++; return HttpResponse.json({ data: [] });
    }),
    http.get("/api/v1/admin/projects/:id/procurement-identity", ({ params }) => {
      reads.identities.push(String(params.id));
      return HttpResponse.json({ data: {
        projectId: params.id, city: { name: params.id === "project-a" ? "Pune" : "Mumbai", key: params.id === "project-a" ? "pune" : "mumbai" },
        programManagerId: params.id === "project-a" ? "manager-one" : "manager-three", version: 1
      } });
    }),
    http.get("/api/v1/admin/program-managers", () => {
      reads.managers++;
      return HttpResponse.json({ data: { items: [
        { id: "manager-one", name: "Project Manager person", email: "manager@example.test" },
        { id: "manager-two", name: "Alternate Project Manager", email: "manager-two@example.test" },
        { id: "manager-three", name: "Garden Project Manager", email: "manager-three@example.test" }
      ], total: 3, limit: 50, offset: 0 } });
    })
  );
  return reads;
}

function Harness({ presentation = "primary", initial = project(), canAssignDesigner = true, canAssignWorkers = true, canManageProjectManager = true }: {
  presentation?: "primary" | "standard"; initial?: AdminProjectSummary;
  canAssignDesigner?: boolean; canAssignWorkers?: boolean; canManageProjectManager?: boolean;
}) {
  const [current, setCurrent] = useState(initial);
  const [area, setArea] = useState<ProjectAssignmentArea | null>(null);
  return <main><h1>Project assignments</h1>
    <button type="button" onClick={() => { setCurrent(project("project-b")); setArea(null); }}>Open second project</button>
    <ProjectPeopleAssignments project={current} canAssignDesigner={canAssignDesigner} canAssignWorkers={canAssignWorkers}
      canManageProjectManager={canManageProjectManager} area={area} onAreaChange={setArea} presentation={presentation} />
  </main>;
}

const navigation = () => within(screen.getByRole("group", { name: "Assignment responsibility" }));

describe("Primary project assignments", () => {
  it("loads only visited responsibilities, keeps distinct options and retains unsaved choices", async () => {
    const reads = installApi();
    const user = userEvent.setup();
    const view = renderWithQuery(<Harness />);
    expect(navigation().getAllByRole("button")).toHaveLength(3);
    ["Designer", "Procurement", "Project Manager"].forEach((name, index) => expect(navigation().getAllByRole("button")[index]).toHaveAccessibleName(name));
    expect(navigation().getByRole("button", { name: "Designer" })).toHaveAttribute("aria-pressed", "true");
    await screen.findByRole("option", { name: /Second Designer/ });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(reads).toEqual({ designers: 1, workers: 0, tasks: 0, identities: [], managers: 0, sections: 0 });
    await user.selectOptions(screen.getByRole("combobox", { name: "Assigned Designer" }), "designer-two");
    await user.click(navigation().getByRole("button", { name: "Procurement" }));
    const procurement = await screen.findByRole("combobox", { name: "Assigned Procurement" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(procurement).queryByRole("option", { name: /Project Manager/ })).not.toBeInTheDocument();
    await user.selectOptions(procurement, "procurement-one");
    expect(screen.queryByRole("combobox", { name: "Assigned Designer" })).not.toBeInTheDocument();
    expect(view.container.querySelector("#project-people-designer")).toHaveAttribute("hidden");
    expect(view.container.querySelector("#project-people-designer")).toHaveAttribute("inert");
    expect(reads.identities).toEqual([]);
    expect(reads.sections).toBe(0);
    await user.click(navigation().getByRole("button", { name: "Project Manager" }));
    const manager = await screen.findByRole("combobox", { name: "Project Manager" });
    await waitFor(() => expect(within(manager).getByRole("option", { name: /Project Manager person/ })).toBeVisible());
    expect(manager).toHaveValue("manager-one");
    expect(within(manager).queryByRole("option", { name: /Procurement person/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.selectOptions(manager, "manager-two");
    await user.click(navigation().getByRole("button", { name: "Designer" }));
    expect(screen.getByRole("combobox", { name: "Assigned Designer" })).toHaveValue("designer-two");
    await user.click(navigation().getByRole("button", { name: "Procurement" }));
    expect(screen.getByRole("combobox", { name: "Assigned Procurement" })).toHaveValue("procurement-one");
    await user.click(navigation().getByRole("button", { name: "Project Manager" }));
    expect(screen.getByRole("combobox", { name: "Project Manager" })).toHaveValue("manager-two");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(reads).toEqual({ designers: 1, workers: 1, tasks: 1, identities: ["project-a"], managers: 1, sections: 0 });
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("resets visited editors and drafts when the project identity changes", async () => {
    const reads = installApi();
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(navigation().getByRole("button", { name: "Project Manager" }));
    const manager = await screen.findByRole("combobox", { name: "Project Manager" });
    await within(manager).findByRole("option", { name: /Alternate Project Manager/ });
    expect(manager).toHaveValue("manager-one");
    await user.selectOptions(manager, "manager-two");
    await user.click(screen.getByRole("button", { name: "Open second project" }));
    expect(navigation().getByRole("button", { name: "Designer" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Project Manager")).not.toBeInTheDocument();
    expect(reads.identities).toEqual(["project-a"]);
    await user.click(navigation().getByRole("button", { name: "Project Manager" }));
    const nextManager = await screen.findByRole("combobox", { name: "Project Manager" });
    await waitFor(() => expect(nextManager).toHaveValue("manager-three"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(reads.identities).toEqual(["project-a", "project-b"]);
  });

  it("keeps prerequisite and permission restrictions without starting assignment reads", async () => {
    const reads = installApi();
    const user = userEvent.setup();
    const view = renderWithQuery(<Harness initial={{ ...project(), estimate: { ...project().estimate!, initialEstimateApproval: null, status: "draft", canAssignDesigner: false, designerAssignmentBlockedReason: "Initial Client approval is required before assigning a Designer." } }} canManageProjectManager={false} />);
    expect(screen.getByText(/Initial Client approval is required/)).toBeVisible();
    await user.click(navigation().getByRole("button", { name: "Procurement" }));
    expect(screen.getByText(/Project coordination opens after/)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(reads).toEqual({ designers: 0, workers: 0, tasks: 0, identities: [], managers: 0, sections: 0 });
    view.unmount();
    renderWithQuery(<Harness canAssignDesigner={false} canAssignWorkers={false} canManageProjectManager={false} />);
    expect(screen.getByText("You do not have permission to assign a Designer.")).toBeVisible();
    expect(navigation().getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(reads.designers).toBe(0);
  });

  it("retains the standard Admin responsibility order and eager editor behavior", async () => {
    const reads = installApi();
    renderWithQuery(<Harness presentation="standard" initial={{ ...project(), estimate: { ...project().estimate!, designPlanStatus: "approved" } }} />);
    expect(navigation().getAllByRole("button")).toHaveLength(4);
    ["Procurement", "Project Manager", "Designer", "Trade teams"].forEach((name, index) => expect(navigation().getAllByRole("button")[index]).toHaveAccessibleName(name));
    expect(navigation().getByRole("button", { name: "Procurement" })).toHaveAttribute("aria-pressed", "true");
    await screen.findByRole("combobox", { name: "Assigned Procurement" });
    await waitFor(() => expect(reads.identities).toEqual(["project-a"]));
    expect(reads.sections).toBe(1);
    expect(reads.workers).toBe(1);
  });
});

import type { Role } from "../../contracts/authorization";
import { formatWorkflowLabel, presentProjectDetail, type ProjectDetailPresentation, type ProjectDetailRow } from "./projectDetailModel";

function adminProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "project-admin-1",
    name: "  Lakeside Villa  ",
    status: "active",
    location: "Whitefield, Bengaluru",
    client: { name: "asha Rao", email: "asha@example.test", mobile: "+91 90000 00001" },
    propertyType: "Villa",
    budgetMin: 1200000,
    budgetMax: 1800000,
    estimator: { id: "user-sales-1", name: "Ravi Kumar", email: "ravi@example.test" },
    lead: { id: "lead-internal-1", stage: "proposal_sent", nextAction: "Share revised moodboard", nextActionAt: "2026-09-24T09:05:00.000Z" },
    estimate: {
      id: "estimate-internal-1",
      leadId: "lead-internal-1",
      resolvedProjectId: "project-admin-1",
      version: 4,
      status: "client_approved",
      subtotal: 2000000,
      gst: 360000,
      total: 2360000,
      approvedBaseline: { estimateVersion: 3, reviewRoundId: "round-internal-1", subtotal: 1800000, gst: 324000, total: 2124000, decisionAt: null, decisionSource: "client_portal" },
      designPlanStatus: "assigned",
      designPlanDesigner: { id: "user-designer-1", name: "Meera Iyer", email: "meera@example.test" }
    },
    createdAt: "2026-09-22T18:30:00.000Z",
    ...overrides
  };
}

function estimateWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...(adminProject().estimate as Record<string, unknown>), ...overrides };
}

function hierarchyProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "project-a",
    name: "Palm Residency",
    status: "on_hold",
    location: "Kochi",
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
    floors: [{ id: "floor-1", name: "Ground floor", stages: [] }],
    ...overrides
  };
}

function present(data: unknown, role: Role): ProjectDetailPresentation {
  const result = presentProjectDetail(data, role);
  if (!result) throw new Error("Expected a presentation");
  return result;
}

function allRows(result: ProjectDetailPresentation): readonly ProjectDetailRow[] {
  return [...result.facts, ...result.sections.flatMap((section) => section.groups.flatMap((entry) => entry.rows)), ...result.summary];
}

function allLabels(result: ProjectDetailPresentation): readonly string[] {
  return [
    ...allRows(result).map((entry) => entry.label),
    ...result.sections.flatMap((section) => [section.title, section.subtitle, ...section.groups.map((entry) => entry.title)]),
    ...result.people.map((entry) => entry.role)
  ];
}

function displayedText(result: ProjectDetailPresentation): string {
  return JSON.stringify([
    result.name, result.description, result.status.label, result.created.label,
    allRows(result).map((entry) => [entry.label, entry.value, entry.note]),
    result.sections.map((section) => [section.title, section.subtitle, section.groups.map((entry) => [entry.title, entry.emptyText])]),
    result.people.map((entry) => [entry.role, entry.name, entry.detail, entry.initial])
  ]);
}

function row(result: ProjectDetailPresentation, list: "facts" | "summary", key: string): ProjectDetailRow | undefined {
  return result[list].find((entry) => entry.key === key);
}

function groupOf(result: ProjectDetailPresentation, sectionKey: string, groupKey: string) {
  return result.sections.find((section) => section.key === sectionKey)?.groups.find((entry) => entry.key === groupKey);
}

function expectUnique(keys: readonly string[]) {
  expect(new Set(keys).size).toBe(keys.length);
}

describe("formatWorkflowLabel", () => {
  it("title-cases workflow codes like the web", () => {
    expect(formatWorkflowLabel("on_hold")).toBe("On Hold");
    expect(formatWorkflowLabel("client_approved")).toBe("Client Approved");
    expect(formatWorkflowLabel("active")).toBe("Active");
    expect(formatWorkflowLabel("a__b")).toBe("A B");
    expect(formatWorkflowLabel("")).toBe("");
  });
});

describe("presentProjectDetail", () => {
  it("returns null for data that is not a readable record", () => {
    for (const value of [null, undefined, "project", 42, true, [], [adminProject()]]) {
      expect(presentProjectDetail(value, "admin")).toBeNull();
      expect(presentProjectDetail(value, "site_manager")).toBeNull();
      expect(presentProjectDetail(value, "client")).toBeNull();
    }
  });

  it("chooses the payload shape from the role", () => {
    expect(present(adminProject(), "admin").kind).toBe("admin");
    expect(present(adminProject(), "super_admin").kind).toBe("admin");
    for (const role of ["designer", "site_manager", "design_manager", "estimator_sales", "worker_carpenter", "finance_head"] as const) {
      expect(present(hierarchyProject(), role).kind).toBe("staff");
    }
    expect(present(hierarchyProject(), "client").kind).toBe("client");
    expect(present(adminProject(), "admin").description).toBe("Commercial handoff, estimate and delivery details for this project.");
    expect(present(hierarchyProject(), "designer").description).toBe("Delivery schedule, progress and project structure.");
    expect(present(hierarchyProject(), "client").description).toBe("Your project schedule and progress.");
  });

  it("presents an approved admin project from the immutable approved baseline", () => {
    expect(present(adminProject(), "admin")).toEqual({
      kind: "admin",
      id: "project-admin-1",
      name: "Lakeside Villa",
      description: "Commercial handoff, estimate and delivery details for this project.",
      status: { label: "Active", tone: "active" },
      created: { label: "22 Sep 2026", iso: "2026-09-22T18:30:00.000Z" },
      facts: [
        { key: "client", label: "Client", value: "asha Rao", note: null },
        { key: "location", label: "Location", value: "Whitefield, Bengaluru", note: null },
        { key: "propertyType", label: "Property type", value: "Villa", note: null },
        { key: "created", label: "Created", value: "22 Sep 2026", note: null },
        { key: "estimate", label: "Client-approved value (incl. GST)", value: "₹21,24,000", note: null }
      ],
      sections: [
        {
          key: "information",
          title: "Project information",
          subtitle: "Client, property and budget details",
          groups: [
            {
              key: "project", title: "Project", emptyText: null, wide: false, rows: [
                { key: "location", label: "Location", value: "Whitefield, Bengaluru", note: null },
                { key: "propertyType", label: "Property type", value: "Villa", note: null },
                { key: "budgetRange", label: "Initial client budget range", value: "₹12,00,000 – ₹18,00,000", note: null }
              ]
            },
            {
              key: "client", title: "Client", emptyText: null, wide: false, rows: [
                { key: "clientName", label: "Name", value: "asha Rao", note: null },
                { key: "clientEmail", label: "Email", value: "asha@example.test", note: null },
                { key: "clientMobile", label: "Mobile", value: "+91 90000 00001", note: null }
              ]
            }
          ]
        },
        {
          key: "assignment",
          title: "Assignment & progress",
          subtitle: "Sales assignment and lead progress",
          groups: [
            {
              key: "sales", title: "Sales", emptyText: null, wide: false, rows: [
                { key: "salesAssignee", label: "Assigned to", value: "Ravi Kumar", note: null },
                { key: "salesEmail", label: "Email", value: "ravi@example.test", note: null }
              ]
            },
            {
              key: "lead", title: "Lead progress", emptyText: null, wide: false, rows: [
                { key: "leadStage", label: "Stage", value: "Proposal Sent", note: null },
                { key: "leadNextAction", label: "Next action", value: "Share revised moodboard", note: null },
                { key: "leadNextActionAt", label: "Next action date", value: "24 Sep 2026, 09:05", note: null }
              ]
            },
            {
              key: "estimate", title: "Estimate", emptyText: null, wide: true, rows: [
                { key: "estimateStatus", label: "Status", value: "Client Approved", note: null },
                { key: "estimateValue", label: "Client-approved value (incl. GST)", value: "₹21,24,000", note: null },
                { key: "estimateBaseline", label: "Approved estimate baseline", value: "Version 3", note: null }
              ]
            }
          ]
        }
      ],
      summary: [
        { key: "projectStatus", label: "Project status", value: "Active", note: null },
        { key: "estimateStatus", label: "Estimate status", value: "Client Approved", note: null },
        { key: "estimateValue", label: "Client-approved value (incl. GST)", value: "₹21,24,000", note: null },
        { key: "budgetRange", label: "Initial client budget range", value: "₹12,00,000 – ₹18,00,000", note: null }
      ],
      people: [
        { key: "sales", role: "Sales", name: "Ravi Kumar", detail: "ravi@example.test", initial: "R" },
        { key: "designer", role: "Designer", name: "Meera Iyer", detail: "meera@example.test", initial: "M" },
        { key: "client", role: "Client", name: "asha Rao", detail: "asha@example.test", initial: "A" }
      ]
    });
    expect(displayedText(present(adminProject(), "admin"))).not.toContain("23,60,000");
  });

  it("never falls back to the mutable estimate total when the approved baseline is missing or invalid", () => {
    for (const approvedBaseline of [null, undefined, "2124000", { estimateVersion: 3, total: "2124000" }, { estimateVersion: 3, total: -1 }, { estimateVersion: 3, total: Number.NaN }]) {
      const result = present(adminProject({ estimate: estimateWith({ approvedBaseline }) }), "admin");
      expect(row(result, "facts", "estimate")).toEqual({ key: "estimate", label: "Client-approved value (incl. GST)", value: "Approved baseline unavailable", note: null });
      expect(row(result, "summary", "estimateValue")?.value).toBe("Approved baseline unavailable");
      expect(groupOf(result, "assignment", "estimate")?.rows.map((entry) => [entry.key, entry.value])).toEqual([
        ["estimateStatus", "Client Approved"],
        ["estimateValue", "Approved baseline unavailable"]
      ]);
      expect(displayedText(result)).not.toContain("23,60,000");
      expect(allLabels(result)).not.toContain("Approved estimate baseline");
    }
  });

  it("keeps the approved value but omits the version row when the baseline version is invalid", () => {
    const result = present(adminProject({ estimate: estimateWith({ approvedBaseline: { estimateVersion: "3", total: 2124000 } }) }), "admin");
    expect(row(result, "facts", "estimate")?.value).toBe("₹21,24,000");
    expect(groupOf(result, "assignment", "estimate")?.rows.map((entry) => entry.key)).toEqual(["estimateStatus", "estimateValue"]);
  });

  it("shows a draft estimate as the current value with its status note and ignores stale baselines", () => {
    const result = present(adminProject({
      estimate: estimateWith({ status: "revision_requested", total: 2360000, approvedBaseline: { estimateVersion: 2, total: 1999000 }, designPlanStatus: null })
    }), "admin");
    expect(row(result, "facts", "estimate")).toEqual({ key: "estimate", label: "Current estimate value (incl. GST)", value: "₹23,60,000", note: "Revision Requested" });
    expect(result.status).toEqual({ label: "Active", tone: "active" });
    expect(groupOf(result, "assignment", "estimate")?.rows).toEqual([
      { key: "estimateStatus", label: "Status", value: "Revision Requested", note: null },
      { key: "estimateValue", label: "Current estimate value (incl. GST)", value: "₹23,60,000", note: null }
    ]);
    expect(result.summary.map((entry) => [entry.label, entry.value])).toEqual([
      ["Project status", "Active"],
      ["Estimate status", "Revision Requested"],
      ["Current estimate value (incl. GST)", "₹23,60,000"],
      ["Initial client budget range", "₹12,00,000 – ₹18,00,000"]
    ]);
    expect(displayedText(result)).not.toContain("19,99,000");
    expect(allLabels(result)).not.toContain("Client-approved value (incl. GST)");
  });

  it("uses explicit fallbacks when estimate, lead, estimator, property type and budget are missing", () => {
    const result = present(adminProject({
      status: "planning", estimate: null, lead: null, estimator: null, propertyType: null, budgetMin: null, budgetMax: 5000
    }), "admin");
    expect(result.status).toEqual({ label: "Planning", tone: "planning" });
    expect(result.facts.map((entry) => [entry.key, entry.label, entry.value, entry.note])).toEqual([
      ["client", "Client", "asha Rao", null],
      ["location", "Location", "Whitefield, Bengaluru", null],
      ["propertyType", "Property type", "Not captured", null],
      ["created", "Created", "22 Sep 2026", null],
      ["estimate", "Current estimate value (incl. GST)", "No estimate yet", null]
    ]);
    expect(groupOf(result, "information", "project")?.rows.find((entry) => entry.key === "budgetRange")?.value).toBe("Not captured");
    expect(groupOf(result, "assignment", "sales")).toEqual({
      key: "sales", title: "Sales", emptyText: null, wide: false,
      rows: [{ key: "salesAssignee", label: "Assigned to", value: "Unassigned handoff", note: null }]
    });
    expect(groupOf(result, "assignment", "lead")).toEqual({ key: "lead", title: "Lead progress", rows: [], emptyText: "Unassigned handoff", wide: false });
    expect(groupOf(result, "assignment", "estimate")).toEqual({ key: "estimate", title: "Estimate", rows: [], emptyText: "No estimate yet", wide: true });
    expect(result.summary.map((entry) => entry.value)).toEqual(["Planning", "No estimate yet", "No estimate yet", "Not captured"]);
    expect(result.people).toEqual([{ key: "client", role: "Client", name: "asha Rao", detail: "asha@example.test", initial: "A" }]);
  });

  it("shows Estimation Approval and the designer next action while the design assignment is pending", () => {
    for (const designPlanStatus of [undefined, null, "pending_assignment"]) {
      const estimate = estimateWith({ designPlanStatus, designPlanDesigner: null });
      if (designPlanStatus === undefined) delete estimate.designPlanStatus;
      const result = present(adminProject({ estimate }), "admin");
      expect(result.status).toEqual({ label: "Estimation Approval", tone: "approval" });
      expect(row(result, "summary", "projectStatus")?.value).toBe("Estimation Approval");
      expect(groupOf(result, "assignment", "lead")?.rows.find((entry) => entry.key === "leadNextAction")?.value).toBe("Assign Designer to upload design");
      expect(result.people.map((entry) => entry.key)).toEqual(["sales", "client"]);
    }
    for (const designPlanStatus of ["assigned", "in_progress", 7]) {
      const result = present(adminProject({ estimate: estimateWith({ designPlanStatus }) }), "admin");
      expect(result.status.label).toBe("Active");
      expect(groupOf(result, "assignment", "lead")?.rows.find((entry) => entry.key === "leadNextAction")?.value).toBe("Share revised moodboard");
    }
    const draft = present(adminProject({ estimate: estimateWith({ status: "draft", designPlanStatus: null }) }), "admin");
    expect(draft.status).toEqual({ label: "Active", tone: "active" });
  });

  it("presents two unequal staff projects without cross-contamination", () => {
    const projectA = hierarchyProject();
    const projectB = hierarchyProject({
      id: "project-b",
      name: "Cedar Court",
      status: "completed",
      location: "Pune",
      clientName: "Farah Khan",
      clientEmail: "farah@example.test",
      clientMobile: "+91 90000 00003",
      clientAddress: "4 Koregaon Park, Pune",
      plannedStartAt: "2025-03-01T00:00:00.000Z",
      plannedEndAt: "2025-11-15T00:00:00.000Z",
      actualStartAt: "2025-03-04T00:00:00.000Z",
      actualEndAt: "2025-11-20T00:00:00.000Z",
      createdAt: "2025-02-11T00:00:00.000Z",
      updatedAt: "2025-11-21T12:00:00.000Z",
      progress: 100,
      assignedDesignerIds: ["user-designer-8"],
      managerId: "user-manager-10"
    });
    const first = present(projectA, "site_manager");
    const second = present(projectB, "designer");
    const firstAgain = present(projectA, "site_manager");

    expect(firstAgain).toEqual(first);
    expect(first).toMatchObject({ id: "project-a", name: "Palm Residency", status: { label: "On Hold", tone: "on_hold" }, created: { label: "20 Dec 2025", iso: "2025-12-20T10:00:00.000Z" } });
    expect(second).toMatchObject({ id: "project-b", name: "Cedar Court", status: { label: "Completed", tone: "completed" }, created: { label: "11 Feb 2025", iso: "2025-02-11T00:00:00.000Z" } });
    expect(first.facts.map((entry) => [entry.key, entry.label, entry.value])).toEqual([
      ["client", "Client", "Anil Menon"],
      ["location", "Location", "Kochi"],
      ["created", "Created", "20 Dec 2025"],
      ["progress", "Progress", "38%"],
      ["plannedEnd", "Planned completion", "30 Jun 2026"]
    ]);
    expect(second.facts.map((entry) => [entry.key, entry.value])).toEqual([
      ["client", "Farah Khan"],
      ["location", "Pune"],
      ["created", "11 Feb 2025"],
      ["progress", "100%"],
      ["plannedEnd", "15 Nov 2025"]
    ]);
    expect(first.sections).toEqual([
      {
        key: "information",
        title: "Project information",
        subtitle: "Location, status and client contact",
        groups: [
          {
            key: "project", title: "Project", emptyText: null, wide: false, rows: [
              { key: "location", label: "Location", value: "Kochi", note: null },
              { key: "status", label: "Status", value: "On Hold", note: null }
            ]
          },
          {
            key: "client", title: "Client", emptyText: null, wide: false, rows: [
              { key: "clientName", label: "Name", value: "Anil Menon", note: null },
              { key: "clientEmail", label: "Email", value: "anil@example.test", note: null },
              { key: "clientMobile", label: "Mobile", value: "+91 90000 00002", note: null },
              { key: "clientAddress", label: "Address", value: "12 Marine Drive, Kochi", note: null }
            ]
          }
        ]
      },
      {
        key: "schedule",
        title: "Schedule & progress",
        subtitle: "Planned dates, actual dates and progress",
        groups: [
          {
            key: "schedule", title: "Schedule", emptyText: null, wide: true, rows: [
              { key: "progress", label: "Progress", value: "38%", note: null },
              { key: "plannedStart", label: "Planned start", value: "05 Jan 2026", note: null },
              { key: "plannedEnd", label: "Planned completion", value: "30 Jun 2026", note: null },
              { key: "actualStart", label: "Actual start", value: "12 Jan 2026", note: null },
              { key: "actualEnd", label: "Actual completion", value: "Not recorded", note: null },
              { key: "updated", label: "Last updated", value: "02 Mar 2026", note: null }
            ]
          }
        ]
      }
    ]);
    expect(groupOf(second, "schedule", "schedule")?.rows.map((entry) => entry.value)).toEqual([
      "100%", "01 Mar 2025", "15 Nov 2025", "04 Mar 2025", "20 Nov 2025", "21 Nov 2025"
    ]);
    expect(first.summary.map((entry) => [entry.key, entry.label, entry.value])).toEqual([
      ["projectStatus", "Project status", "On Hold"],
      ["progress", "Progress", "38%"],
      ["plannedEnd", "Planned completion", "30 Jun 2026"],
      ["updated", "Last updated", "02 Mar 2026"]
    ]);
    expect(second.summary.map((entry) => entry.value)).toEqual(["Completed", "100%", "15 Nov 2025", "21 Nov 2025"]);
    expect(first.people).toEqual([{ key: "client", role: "Client", name: "Anil Menon", detail: "anil@example.test", initial: "A" }]);
    expect(second.people).toEqual([{ key: "client", role: "Client", name: "Farah Khan", detail: "farah@example.test", initial: "F" }]);

    const firstText = displayedText(first);
    const secondText = displayedText(second);
    for (const value of ["Cedar Court", "Pune", "Farah Khan", "farah@example.test", "100%", "15 Nov 2025"]) expect(firstText).not.toContain(value);
    for (const value of ["Palm Residency", "Kochi", "Anil Menon", "anil@example.test", "38%", "30 Jun 2026"]) expect(secondText).not.toContain(value);
  });

  it("omits the client fact, group and person when staff payloads have no client fields", () => {
    const result = present(hierarchyProject({ clientName: " ", clientEmail: undefined, clientMobile: null, clientAddress: 42 }), "site_manager");
    expect(result.facts.map((entry) => entry.key)).toEqual(["location", "created", "progress", "plannedEnd"]);
    expect(result.sections[0]?.groups.map((entry) => entry.key)).toEqual(["project"]);
    expect(result.people).toEqual([]);
  });

  it("keeps only present staff client contact rows and omits the person without a name", () => {
    const result = present(hierarchyProject({ clientName: null, clientMobile: "", clientAddress: null }), "site_manager");
    expect(groupOf(result, "information", "client")?.rows).toEqual([{ key: "clientEmail", label: "Email", value: "anil@example.test", note: null }]);
    expect(result.facts.map((entry) => entry.key)).not.toContain("client");
    expect(result.people).toEqual([]);
  });

  it("never shows client contact or admin-only labels to the client role", () => {
    const result = present({
      id: "project-client-1",
      name: "My Home",
      status: "active",
      location: "Chennai",
      plannedStartAt: "2026-04-01T00:00:00.000Z",
      plannedEndAt: "2026-10-31T00:00:00.000Z",
      actualStartAt: null,
      actualEndAt: null,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      progress: 54,
      floors: [],
      clientName: "Leaked Name",
      clientEmail: "leaked@example.test",
      clientMobile: "+91 99999 99999",
      clientAddress: "Leaked address",
      estimate: estimateWith({}),
      estimator: { id: "user-sales-1", name: "Ravi Kumar", email: "ravi@example.test" },
      budgetMin: 100,
      budgetMax: 200
    }, "client");
    expect(result.kind).toBe("client");
    expect(result.facts.map((entry) => [entry.key, entry.value])).toEqual([
      ["location", "Chennai"],
      ["created", "15 Mar 2026"],
      ["progress", "54%"],
      ["plannedEnd", "31 Oct 2026"]
    ]);
    expect(result.sections.map((section) => [section.key, section.subtitle, section.groups.map((entry) => entry.key)])).toEqual([
      ["information", "Location and status", ["project"]],
      ["schedule", "Planned dates, actual dates and progress", ["schedule"]]
    ]);
    expect(groupOf(result, "schedule", "schedule")?.rows.filter((entry) => entry.key.startsWith("actual")).map((entry) => entry.value)).toEqual(["Not recorded", "Not recorded"]);
    expect(result.people).toEqual([]);
    const labels = allLabels(result);
    for (const label of ["Client-approved value (incl. GST)", "Current estimate value (incl. GST)", "Sales", "Initial client budget range", "Client", "Email", "Mobile", "Address", "Estimate status"]) {
      expect(labels).not.toContain(label);
    }
    const text = displayedText(result);
    for (const value of ["Leaked", "leaked@example.test", "99999", "Ravi Kumar", "₹"]) expect(text).not.toContain(value);
  });

  it("never displays ID-only or internal reference fields", () => {
    const staff = present(hierarchyProject(), "design_manager");
    const admin = present(adminProject(), "super_admin");
    for (const value of ["user-designer-7", "user-manager-9", "user-site-9", "floor-1", "Ground floor"]) expect(displayedText(staff)).not.toContain(value);
    for (const value of ["user-sales-1", "user-designer-1", "lead-internal-1", "estimate-internal-1", "round-internal-1"]) expect(displayedText(admin)).not.toContain(value);
    expect(staff.id).toBe("project-a");
    expect(admin.id).toBe("project-admin-1");
  });

  it("unwraps a { project } envelope like the existing project screen", () => {
    expect(present({ project: hierarchyProject() }, "site_manager")).toEqual(present(hierarchyProject(), "site_manager"));
    expect(present({ project: adminProject() }, "admin")).toEqual(present(adminProject(), "admin"));
    expect(present({ project: hierarchyProject({ progress: 12 }) }, "client")).toEqual(present(hierarchyProject({ progress: 12 }), "client"));
  });

  it("formats dates in UTC with fixed month names and explicit fallbacks for invalid values", () => {
    const valid = present(hierarchyProject({
      createdAt: "2026-09-22T01:00:00+05:30",
      plannedStartAt: "2026-08-02",
      plannedEndAt: "2026-12-31T23:59:59.999Z",
      actualStartAt: "2026-05-09T00:00:00.000Z",
      actualEndAt: "2026-09-30T20:00:00-05:00",
      updatedAt: "2026-09-01T00:00:00.000Z"
    }), "site_manager");
    expect(valid.created).toEqual({ label: "21 Sep 2026", iso: "2026-09-22T01:00:00+05:30" });
    expect(groupOf(valid, "schedule", "schedule")?.rows.map((entry) => entry.value)).toEqual([
      "38%", "02 Aug 2026", "31 Dec 2026", "09 May 2026", "01 Oct 2026", "01 Sep 2026"
    ]);
    expect(displayedText(valid)).not.toContain("Sept");

    const invalid = present(hierarchyProject({
      createdAt: "2026-02-30T00:00:00.000Z",
      plannedStartAt: "yesterday",
      plannedEndAt: "2026-09-22T10:00:00",
      actualStartAt: "garbage",
      actualEndAt: 1758500000000,
      updatedAt: "2026-13-02"
    }), "site_manager");
    expect(invalid.created).toEqual({ label: "Not captured", iso: null });
    expect(groupOf(invalid, "schedule", "schedule")?.rows.map((entry) => entry.value)).toEqual([
      "38%", "Not captured", "Not captured", "Not recorded", "Not recorded", "Not captured"
    ]);
    expect(present(hierarchyProject({ createdAt: undefined }), "client").created).toEqual({ label: "Not captured", iso: null });

    const leadDate = (nextActionAt: unknown) => groupOf(
      present(adminProject({ lead: { stage: "site_visit", nextAction: "Call", nextActionAt } }), "admin"), "assignment", "lead"
    )?.rows.find((entry) => entry.key === "leadNextActionAt")?.value;
    expect(leadDate("2026-09-21T23:59:00+05:30")).toBe("21 Sep 2026, 18:29");
    expect(leadDate("2026-09-21T24:30:00Z")).toBe("Not captured");
    expect(leadDate("soon")).toBe("Not captured");
    expect(leadDate(null)).toBe("Not captured");
  });

  it("falls back safely for wrong field types", () => {
    const staff = present(hierarchyProject({ id: 7, name: 42, status: 5, location: ["Kochi"], progress: "50" }), "site_manager");
    expect(staff).toMatchObject({ id: null, name: "Untitled project", status: { label: "Status unavailable", tone: "unknown" } });
    expect(row(staff, "facts", "location")?.value).toBe("Not captured");
    expect(row(staff, "facts", "progress")?.value).toBe("Not captured");
    for (const progress of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(row(present(hierarchyProject({ progress }), "client"), "facts", "progress")?.value).toBe("Not captured");
    }
    expect(row(present(hierarchyProject({ progress: 0 }), "client"), "facts", "progress")?.value).toBe("0%");
    expect(present(hierarchyProject({ status: "archived" }), "client").status).toEqual({ label: "Archived", tone: "unknown" });
    expect(present(hierarchyProject({ status: "__" }), "client").status).toEqual({ label: "Status unavailable", tone: "unknown" });

    const admin = present(adminProject({
      name: "  ", status: null, client: "Asha", propertyType: 3, budgetMin: -5, budgetMax: 100, estimator: "Ravi", lead: [],
      estimate: estimateWith({ status: "sent_to_client", total: "2360000" })
    }), "admin");
    expect(admin).toMatchObject({ name: "Untitled project", status: { label: "Status unavailable", tone: "unknown" } });
    expect(admin.facts.map((entry) => [entry.key, entry.value, entry.note])).toEqual([
      ["client", "Not captured", null],
      ["location", "Whitefield, Bengaluru", null],
      ["propertyType", "Not captured", null],
      ["created", "22 Sep 2026", null],
      ["estimate", "Not captured", "Sent To Client"]
    ]);
    expect(groupOf(admin, "information", "client")?.rows.map((entry) => entry.value)).toEqual(["Not captured", "Not captured", "Not captured"]);
    expect(groupOf(admin, "assignment", "sales")?.rows.map((entry) => entry.value)).toEqual(["Unassigned handoff"]);
    expect(groupOf(admin, "assignment", "lead")?.emptyText).toBe("Unassigned handoff");
    expect(row(admin, "summary", "budgetRange")?.value).toBe("Not captured");
    expect(admin.people.map((entry) => entry.key)).toEqual(["designer"]);
    expect(present(adminProject({ client: {}, estimator: { name: " " }, estimate: null }), "admin").people).toEqual([]);
    expect(present(adminProject({ estimate: estimateWith({ status: null }) }), "admin").facts.find((entry) => entry.key === "estimate")).toEqual({
      key: "estimate", label: "Current estimate value (incl. GST)", value: "₹23,60,000", note: null
    });
  });

  it("keeps every key unique and independent of display names", () => {
    const fixtures: readonly [unknown, Role][] = [
      [adminProject(), "admin"],
      [adminProject({ estimate: null, lead: null, estimator: null }), "super_admin"],
      [hierarchyProject(), "site_manager"],
      [hierarchyProject({ clientName: null, clientEmail: null, clientMobile: null, clientAddress: null }), "designer"],
      [hierarchyProject(), "client"]
    ];
    for (const [data, role] of fixtures) {
      const result = present(data, role);
      expectUnique(result.facts.map((entry) => entry.key));
      expectUnique(result.summary.map((entry) => entry.key));
      expectUnique(result.people.map((entry) => entry.key));
      expectUnique(result.sections.map((section) => section.key));
      expectUnique(result.sections.flatMap((section) => section.groups.map((entry) => entry.key)));
      expectUnique(result.sections.flatMap((section) => section.groups.flatMap((entry) => entry.rows.map((item) => item.key))));
    }
    const renamed = present(adminProject({
      client: { name: "Zed Client", email: "zed@example.test", mobile: "1" },
      estimator: { id: "user-sales-2", name: "Another Seller", email: "seller@example.test" },
      estimate: estimateWith({ designPlanDesigner: { id: "user-designer-2", name: "Other Designer", email: "other@example.test" } })
    }), "admin");
    expect(renamed.people.map((entry) => entry.key)).toEqual(present(adminProject(), "admin").people.map((entry) => entry.key));
    expect(renamed.people.map((entry) => entry.key)).toEqual(["sales", "designer", "client"]);
    expect(allRows(renamed).map((entry) => entry.key)).toEqual(allRows(present(adminProject(), "admin")).map((entry) => entry.key));
  });

  it("preserves long values without truncation", () => {
    const longName = `Residence ${"with an unusually long descriptive name ".repeat(8).trim()}`;
    const longLocation = `${"Tower 7, Phase 3, Outer Ring Road Service Lane, ".repeat(6).trim()} Bengaluru 560103`;
    const longEmail = `${"very.long.client.mailbox.segment.".repeat(4)}owner@example.test`;
    const staff = present(hierarchyProject({ name: `  ${longName}  `, location: longLocation, clientName: longName, clientEmail: longEmail }), "site_manager");
    expect(staff.name).toBe(longName);
    expect(row(staff, "facts", "location")?.value).toBe(longLocation);
    expect(groupOf(staff, "information", "client")?.rows.find((entry) => entry.key === "clientEmail")?.value).toBe(longEmail);
    expect(staff.people[0]).toMatchObject({ name: longName, detail: longEmail, initial: "R" });

    const admin = present(adminProject({ name: longName, location: longLocation, client: { name: longName, email: longEmail, mobile: "+91 90000 00001" } }), "admin");
    expect(admin.name).toBe(longName);
    expect(groupOf(admin, "information", "project")?.rows[0]?.value).toBe(longLocation);
    expect(row(admin, "facts", "client")?.value).toBe(longName);
  });
});

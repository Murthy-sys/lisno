import type { Role } from "../../contracts/authorization";
import {
  formatWorkflowLabel,
  presentProjectDetail,
  type ProjectDetailIcon,
  type ProjectDetailPresentation,
  type ProjectDetailRow
} from "./projectDetailModel";

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

const ICONS: ReadonlySet<ProjectDetailIcon> = new Set<ProjectDetailIcon>([
  "person", "home", "pin", "calendar", "calendarCheck", "rupee", "mail", "phone",
  "status", "progress", "clock", "flag", "arrow", "version"
]);

const APPROVED_PILL = { label: "Approved", tone: "unknown", approved: true } as const;

/** Expected row literal; every presented row carries `note: null` and an icon key. */
function r(key: string, label: string, value: string, icon: ProjectDetailIcon): ProjectDetailRow {
  return { key, label, value, note: null, icon };
}

function present(data: unknown, role: Role): ProjectDetailPresentation {
  const result = presentProjectDetail(data, role);
  if (!result) throw new Error("Expected a presentation");
  return result;
}

function allRows(result: ProjectDetailPresentation): readonly ProjectDetailRow[] {
  return [
    ...result.overview,
    ...result.sections.flatMap((section) => section.groups.flatMap((entry) => entry.rows)),
    ...(result.estimate?.rows ?? [])
  ];
}

function allLabels(result: ProjectDetailPresentation): readonly string[] {
  return [
    result.subtitle,
    result.value.label,
    ...allRows(result).map((entry) => entry.label),
    ...result.sections.flatMap((section) => [section.title, section.subtitle, ...section.groups.map((entry) => entry.title)]),
    ...result.people.map((entry) => entry.role)
  ];
}

/** Everything a renderer may show. The project and estimate IDs are action references and deliberately excluded. */
function displayedText(result: ProjectDetailPresentation): string {
  return JSON.stringify([
    result.name, result.subtitle, result.status.label, result.created.label,
    [result.value.label, result.value.value, result.value.pill?.label ?? null],
    allRows(result).map((entry) => [entry.label, entry.value, entry.note]),
    result.sections.map((section) => [section.title, section.subtitle, section.groups.map((entry) => [entry.title, entry.emptyText])]),
    result.estimate ? [result.estimate.statusLabel, result.estimate.emptyText] : null,
    result.people.map((entry) => [entry.role, entry.name, entry.detail, entry.initial])
  ]);
}

function overviewRow(result: ProjectDetailPresentation, key: string): ProjectDetailRow | undefined {
  return result.overview.find((entry) => entry.key === key);
}

function estimateRow(result: ProjectDetailPresentation, key: string): ProjectDetailRow | undefined {
  return result.estimate?.rows.find((entry) => entry.key === key);
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

  it("chooses the payload shape and page subtitle from the role", () => {
    expect(present(adminProject(), "admin").kind).toBe("admin");
    expect(present(adminProject(), "super_admin").kind).toBe("admin");
    for (const role of ["designer", "site_manager", "design_manager", "estimator_sales", "worker_carpenter", "finance_head"] as const) {
      expect(present(hierarchyProject(), role).kind).toBe("staff");
    }
    expect(present(hierarchyProject(), "client").kind).toBe("client");
    expect(present(adminProject(), "admin").subtitle).toBe("Client, property and budget details");
    expect(present(adminProject(), "super_admin").subtitle).toBe("Client, property and budget details");
    expect(present(hierarchyProject(), "designer").subtitle).toBe("Client, schedule and progress details");
    expect(present(hierarchyProject(), "client").subtitle).toBe("Schedule and progress details");
    for (const result of [present(adminProject(), "admin"), present(hierarchyProject(), "designer"), present(hierarchyProject(), "client")]) {
      expect(result).not.toHaveProperty("facts");
      expect(result).not.toHaveProperty("summary");
      expect(result).not.toHaveProperty("description");
    }
  });

  it("presents an approved admin project from the immutable approved baseline", () => {
    expect(present(adminProject(), "admin")).toEqual({
      kind: "admin",
      id: "project-admin-1",
      name: "Lakeside Villa",
      subtitle: "Client, property and budget details",
      status: { label: "Active", tone: "active" },
      created: { label: "22 Sep 2026", iso: "2026-09-22T18:30:00.000Z" },
      overview: [
        r("client", "Client", "asha Rao", "person"),
        r("propertyType", "Property type", "Villa", "home"),
        r("location", "Location", "Whitefield, Bengaluru", "pin"),
        r("created", "Created", "22 Sep 2026", "calendar")
      ],
      value: { kind: "estimate", label: "Client-approved value (incl. GST)", value: "₹21,24,000", pill: APPROVED_PILL },
      sections: [
        {
          key: "information",
          title: "Project information",
          subtitle: "Client, property and budget details",
          groups: [
            {
              key: "project", title: "Project", emptyText: null, wide: false, rows: [
                r("location", "Location", "Whitefield, Bengaluru", "pin"),
                r("propertyType", "Property type", "Villa", "home"),
                r("budgetRange", "Initial client budget range", "₹12,00,000 – ₹18,00,000", "rupee")
              ]
            },
            {
              key: "client", title: "Client", emptyText: null, wide: false, rows: [
                r("clientName", "Client name", "asha Rao", "person"),
                r("clientEmail", "Email", "asha@example.test", "mail"),
                r("clientMobile", "Mobile", "+91 90000 00001", "phone")
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
              key: "status", title: "Status", emptyText: null, wide: true, rows: [
                r("projectStatus", "Project status", "Active", "status")
              ]
            },
            {
              key: "sales", title: "Sales", emptyText: null, wide: false, rows: [
                r("salesAssignee", "Assigned to", "Ravi Kumar", "person"),
                r("salesEmail", "Email", "ravi@example.test", "mail")
              ]
            },
            {
              key: "lead", title: "Lead progress", emptyText: null, wide: false, rows: [
                r("leadStage", "Stage", "Proposal Sent", "flag"),
                r("leadNextAction", "Next action", "Share revised moodboard", "arrow"),
                r("leadNextActionAt", "Next action date", "24 Sep 2026, 09:05", "clock")
              ]
            }
          ]
        }
      ],
      estimate: {
        id: "estimate-internal-1",
        statusLabel: "Client Approved",
        emptyText: null,
        rows: [
          r("estimateStatus", "Status", "Client Approved", "status"),
          r("estimateValue", "Client-approved value (incl. GST)", "₹21,24,000", "rupee"),
          r("estimateBaseline", "Approved estimate baseline", "Version 3", "version"),
          r("budgetRange", "Initial client budget range", "₹12,00,000 – ₹18,00,000", "rupee")
        ]
      },
      people: [
        { key: "sales", role: "Sales", name: "Ravi Kumar", detail: "ravi@example.test", initial: "R" },
        { key: "designer", role: "Designer", name: "Meera Iyer", detail: "meera@example.test", initial: "M" },
        { key: "client", role: "Client", name: "asha Rao", detail: "asha@example.test", initial: "A" }
      ]
    });
    expect(displayedText(present(adminProject(), "admin"))).not.toContain("23,60,000");
  });

  it("presents the value card for every admin estimate state without using the mutable total once approved", () => {
    const cases: readonly [string, Record<string, unknown>, ProjectDetailPresentation["value"]][] = [
      ["approved with baseline", adminProject(), {
        kind: "estimate", label: "Client-approved value (incl. GST)", value: "₹21,24,000", pill: APPROVED_PILL
      }],
      ["approved without baseline", adminProject({ estimate: estimateWith({ approvedBaseline: null }) }), {
        kind: "estimate", label: "Client-approved value (incl. GST)", value: "Approved baseline unavailable", pill: APPROVED_PILL
      }],
      ["draft", adminProject({ estimate: estimateWith({ status: "draft", total: 1500000, designPlanStatus: null }) }), {
        kind: "estimate", label: "Current estimate value (incl. GST)", value: "₹15,00,000", pill: { label: "Draft", tone: "unknown", approved: false }
      }],
      ["sent to client", adminProject({ estimate: estimateWith({ status: "sent_to_client", designPlanStatus: null }) }), {
        kind: "estimate", label: "Current estimate value (incl. GST)", value: "₹23,60,000", pill: { label: "Sent To Client", tone: "unknown", approved: false }
      }],
      ["no estimate", adminProject({ estimate: null }), {
        kind: "estimate", label: "Current estimate value (incl. GST)", value: "No estimate yet", pill: null
      }]
    ];
    for (const [name, data, expected] of cases) {
      expect({ name, value: present(data, "admin").value }).toEqual({ name, value: expected });
    }
    for (const approvedBaseline of [null, { estimateVersion: 3 }]) {
      const result = present(adminProject({ estimate: estimateWith({ approvedBaseline }) }), "admin");
      expect(result.value.value).not.toContain("23,60,000");
      expect(result.value.pill).toEqual(APPROVED_PILL);
    }
  });

  it("presents the progress value card with the project status pill for staff and client", () => {
    expect(present(hierarchyProject(), "site_manager").value).toEqual({
      kind: "progress", label: "Overall progress", value: "38%", pill: { label: "On Hold", tone: "on_hold", approved: false }
    });
    expect(present(hierarchyProject({ status: "active", progress: 54 }), "client").value).toEqual({
      kind: "progress", label: "Overall progress", value: "54%", pill: { label: "Active", tone: "active", approved: false }
    });
    expect(present(hierarchyProject({ status: "completed", progress: null }), "designer").value).toEqual({
      kind: "progress", label: "Overall progress", value: "Not captured", pill: { label: "Completed", tone: "completed", approved: false }
    });
    expect(present(hierarchyProject({ status: undefined }), "client").value.pill).toEqual({ label: "Status unavailable", tone: "unknown", approved: false });
  });

  it("presents four overview facts in the order for each payload kind", () => {
    expect(present(adminProject(), "admin").overview).toEqual([
      r("client", "Client", "asha Rao", "person"),
      r("propertyType", "Property type", "Villa", "home"),
      r("location", "Location", "Whitefield, Bengaluru", "pin"),
      r("created", "Created", "22 Sep 2026", "calendar")
    ]);
    expect(present(hierarchyProject(), "site_manager").overview).toEqual([
      r("client", "Client", "Anil Menon", "person"),
      r("plannedEnd", "Planned completion", "30 Jun 2026", "calendarCheck"),
      r("location", "Location", "Kochi", "pin"),
      r("created", "Created", "20 Dec 2025", "calendar")
    ]);
    expect(present(hierarchyProject(), "client").overview).toEqual([
      r("plannedStart", "Planned start", "05 Jan 2026", "calendar"),
      r("plannedEnd", "Planned completion", "30 Jun 2026", "calendarCheck"),
      r("location", "Location", "Kochi", "pin"),
      r("created", "Created", "20 Dec 2025", "calendar")
    ]);
    expect(present(hierarchyProject({ clientName: null, plannedEndAt: null, location: " ", createdAt: null }), "designer").overview.map((entry) => entry.value)).toEqual([
      "Not captured", "Not captured", "Not captured", "Not captured"
    ]);
  });

  it("builds the admin estimate block and never builds one for staff or client", () => {
    const approved = present(adminProject(), "admin");
    expect(approved.estimate?.id).toBe("estimate-internal-1");
    expect(approved.estimate?.statusLabel).toBe("Client Approved");

    const draft = present(adminProject({ estimate: estimateWith({ id: "estimate-internal-9", status: "draft", total: 990000, designPlanStatus: null }) }), "admin");
    expect(draft.estimate).toEqual({
      id: "estimate-internal-9",
      statusLabel: "Draft",
      emptyText: null,
      rows: [
        r("estimateStatus", "Status", "Draft", "status"),
        r("estimateValue", "Current estimate value (incl. GST)", "₹9,90,000", "rupee"),
        r("budgetRange", "Initial client budget range", "₹12,00,000 – ₹18,00,000", "rupee")
      ]
    });

    expect(present(adminProject({ estimate: estimateWith({ id: " " }) }), "admin").estimate?.id).toBeNull();
    expect(present(adminProject({ estimate: estimateWith({ id: 17 }) }), "admin").estimate?.id).toBeNull();
    expect(present(adminProject({ estimate: estimateWith({ status: 3 }) }), "admin").estimate?.statusLabel).toBe("Not captured");
    expect(present(adminProject({ estimate: null }), "super_admin").estimate).toEqual({
      id: null, statusLabel: "No estimate yet", rows: [], emptyText: "No estimate yet"
    });

    const leakyHierarchy = hierarchyProject({
      estimate: estimateWith({}), budgetMin: 100, budgetMax: 200, propertyType: "Villa",
      estimator: { id: "user-sales-1", name: "Ravi Kumar", email: "ravi@example.test" }
    });
    for (const role of ["designer", "site_manager", "client"] as const) {
      const result = present(leakyHierarchy, role);
      expect(result.estimate).toBeNull();
      expect(result.value.kind).toBe("progress");
      const text = displayedText(result);
      for (const value of ["₹", "Villa", "Ravi Kumar", "Client Approved", "Approved", "estimate-internal-1"]) expect(text).not.toContain(value);
      for (const label of ["Client-approved value (incl. GST)", "Current estimate value (incl. GST)", "Initial client budget range", "Property type", "Approved estimate baseline", "Sales"]) {
        expect(allLabels(result)).not.toContain(label);
      }
    }
  });

  it("never falls back to the mutable estimate total when the approved baseline is missing or invalid", () => {
    for (const approvedBaseline of [null, undefined, "2124000", { estimateVersion: 3, total: "2124000" }, { estimateVersion: 3, total: -1 }, { estimateVersion: 3, total: Number.NaN }]) {
      const result = present(adminProject({ estimate: estimateWith({ approvedBaseline }) }), "admin");
      expect(result.value).toEqual({ kind: "estimate", label: "Client-approved value (incl. GST)", value: "Approved baseline unavailable", pill: APPROVED_PILL });
      expect(result.estimate?.rows.map((entry) => [entry.key, entry.value])).toEqual([
        ["estimateStatus", "Client Approved"],
        ["estimateValue", "Approved baseline unavailable"],
        ["budgetRange", "₹12,00,000 – ₹18,00,000"]
      ]);
      expect(displayedText(result)).not.toContain("23,60,000");
      expect(allLabels(result)).not.toContain("Approved estimate baseline");
    }
  });

  it("keeps the approved value but omits the version row when the baseline version is invalid", () => {
    const result = present(adminProject({ estimate: estimateWith({ approvedBaseline: { estimateVersion: "3", total: 2124000 } }) }), "admin");
    expect(result.value.value).toBe("₹21,24,000");
    expect(estimateRow(result, "estimateValue")?.value).toBe("₹21,24,000");
    expect(result.estimate?.rows.map((entry) => entry.key)).toEqual(["estimateStatus", "estimateValue", "budgetRange"]);
  });

  it("shows a draft estimate as the current value with its status pill and ignores stale baselines", () => {
    const result = present(adminProject({
      estimate: estimateWith({ status: "revision_requested", total: 2360000, approvedBaseline: { estimateVersion: 2, total: 1999000 }, designPlanStatus: null })
    }), "admin");
    expect(result.value).toEqual({
      kind: "estimate", label: "Current estimate value (incl. GST)", value: "₹23,60,000", pill: { label: "Revision Requested", tone: "unknown", approved: false }
    });
    expect(result.status).toEqual({ label: "Active", tone: "active" });
    expect(result.estimate?.rows).toEqual([
      r("estimateStatus", "Status", "Revision Requested", "status"),
      r("estimateValue", "Current estimate value (incl. GST)", "₹23,60,000", "rupee"),
      r("budgetRange", "Initial client budget range", "₹12,00,000 – ₹18,00,000", "rupee")
    ]);
    expect(groupOf(result, "assignment", "status")?.rows).toEqual([r("projectStatus", "Project status", "Active", "status")]);
    expect(displayedText(result)).not.toContain("19,99,000");
    expect(allLabels(result)).not.toContain("Client-approved value (incl. GST)");
    expect(allLabels(result)).not.toContain("Approved estimate baseline");
  });

  it("uses explicit fallbacks when estimate, lead, estimator, property type and budget are missing", () => {
    const result = present(adminProject({
      status: "planning", estimate: null, lead: null, estimator: null, propertyType: null, budgetMin: null, budgetMax: 5000
    }), "admin");
    expect(result.status).toEqual({ label: "Planning", tone: "planning" });
    expect(result.overview.map((entry) => [entry.key, entry.label, entry.value, entry.note])).toEqual([
      ["client", "Client", "asha Rao", null],
      ["propertyType", "Property type", "Not captured", null],
      ["location", "Location", "Whitefield, Bengaluru", null],
      ["created", "Created", "22 Sep 2026", null]
    ]);
    expect(result.value).toEqual({ kind: "estimate", label: "Current estimate value (incl. GST)", value: "No estimate yet", pill: null });
    expect(groupOf(result, "information", "project")?.rows.find((entry) => entry.key === "budgetRange")?.value).toBe("Not captured");
    expect(result.sections.find((section) => section.key === "assignment")?.groups.map((entry) => entry.key)).toEqual(["status", "sales", "lead"]);
    expect(groupOf(result, "assignment", "status")?.rows).toEqual([r("projectStatus", "Project status", "Planning", "status")]);
    expect(groupOf(result, "assignment", "sales")).toEqual({
      key: "sales", title: "Sales", emptyText: null, wide: false,
      rows: [r("salesAssignee", "Assigned to", "Unassigned handoff", "person")]
    });
    expect(groupOf(result, "assignment", "lead")).toEqual({ key: "lead", title: "Lead progress", rows: [], emptyText: "Unassigned handoff", wide: false });
    expect(groupOf(result, "assignment", "estimate")).toBeUndefined();
    expect(result.estimate).toEqual({ id: null, statusLabel: "No estimate yet", rows: [], emptyText: "No estimate yet" });
    expect(result.people).toEqual([{ key: "client", role: "Client", name: "asha Rao", detail: "asha@example.test", initial: "A" }]);
  });

  it("puts the project status group first in Assignment & progress, before sales and lead progress", () => {
    const fixtures: readonly [Record<string, unknown>, string][] = [
      [adminProject(), "Active"],
      [adminProject({ estimate: estimateWith({ designPlanStatus: "pending_assignment" }) }), "Estimation Approval"],
      [adminProject({ status: "on_hold", estimate: null }), "On Hold"],
      [adminProject({ status: 9 }), "Status unavailable"]
    ];
    for (const [data, label] of fixtures) {
      const result = present(data, "admin");
      const assignment = result.sections.find((section) => section.key === "assignment");
      expect(assignment?.groups.map((entry) => entry.key)).toEqual(["status", "sales", "lead"]);
      expect(assignment?.groups[0]).toEqual({
        key: "status", title: "Status", emptyText: null, wide: true, rows: [r("projectStatus", "Project status", label, "status")]
      });
      expect(result.status.label).toBe(label);
    }
  });

  it("shows Estimation Approval and the designer next action while the design assignment is pending", () => {
    for (const designPlanStatus of [undefined, null, "pending_assignment"]) {
      const estimate = estimateWith({ designPlanStatus, designPlanDesigner: null });
      if (designPlanStatus === undefined) delete estimate.designPlanStatus;
      const result = present(adminProject({ estimate }), "admin");
      expect(result.status).toEqual({ label: "Estimation Approval", tone: "approval" });
      expect(groupOf(result, "assignment", "status")?.rows[0]?.value).toBe("Estimation Approval");
      expect(groupOf(result, "assignment", "lead")?.rows.find((entry) => entry.key === "leadNextAction")?.value).toBe("Assign Designer to upload design");
      expect(result.value.pill).toEqual(APPROVED_PILL);
      expect(result.people.map((entry) => entry.key)).toEqual(["sales", "client"]);
    }
    for (const designPlanStatus of ["assigned", "in_progress", 7]) {
      const result = present(adminProject({ estimate: estimateWith({ designPlanStatus }) }), "admin");
      expect(result.status.label).toBe("Active");
      expect(groupOf(result, "assignment", "status")?.rows[0]?.value).toBe("Active");
      expect(groupOf(result, "assignment", "lead")?.rows.find((entry) => entry.key === "leadNextAction")?.value).toBe("Share revised moodboard");
    }
    const draft = present(adminProject({ estimate: estimateWith({ status: "draft", designPlanStatus: null }) }), "admin");
    expect(draft.status).toEqual({ label: "Active", tone: "active" });
    expect(groupOf(draft, "assignment", "status")?.rows[0]?.value).toBe("Active");
  });

  it("presents two unequal admin projects without cross-contamination", () => {
    const lakeside = adminProject();
    const harbour = adminProject({
      id: "project-admin-2",
      name: "Harbour Heights",
      status: "planning",
      location: "Fort Kochi",
      client: { name: "Farah Khan", email: "farah@example.test", mobile: "+91 90000 00009" },
      propertyType: "Apartment",
      budgetMin: 2500000,
      budgetMax: 3000000,
      estimator: { id: "user-sales-2", name: "Nisha Paul", email: "nisha@example.test" },
      lead: { id: "lead-internal-2", stage: "negotiation", nextAction: "Confirm kitchen layout", nextActionAt: "2026-08-03T11:40:00.000Z" },
      estimate: {
        id: "estimate-internal-2",
        status: "client_approved",
        total: 3150000,
        approvedBaseline: { estimateVersion: 5, total: 2950000 },
        designPlanStatus: "pending_assignment",
        designPlanDesigner: null
      },
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    const first = present(lakeside, "admin");
    const second = present(harbour, "super_admin");
    const firstAgain = present(lakeside, "admin");

    expect(firstAgain).toEqual(first);
    expect(first).toMatchObject({ id: "project-admin-1", name: "Lakeside Villa", status: { label: "Active", tone: "active" } });
    expect(second).toMatchObject({ id: "project-admin-2", name: "Harbour Heights", status: { label: "Estimation Approval", tone: "approval" } });
    expect(first.value).toEqual({ kind: "estimate", label: "Client-approved value (incl. GST)", value: "₹21,24,000", pill: APPROVED_PILL });
    expect(second.value).toEqual({ kind: "estimate", label: "Client-approved value (incl. GST)", value: "₹29,50,000", pill: APPROVED_PILL });
    expect(first.estimate?.id).toBe("estimate-internal-1");
    expect(second.estimate?.id).toBe("estimate-internal-2");
    expect(first.overview.map((entry) => entry.value)).toEqual(["asha Rao", "Villa", "Whitefield, Bengaluru", "22 Sep 2026"]);
    expect(second.overview.map((entry) => entry.value)).toEqual(["Farah Khan", "Apartment", "Fort Kochi", "01 Aug 2026"]);
    expect(second.estimate?.rows.map((entry) => entry.value)).toEqual(["Client Approved", "₹29,50,000", "Version 5", "₹25,00,000 – ₹30,00,000"]);
    expect(groupOf(second, "assignment", "lead")?.rows.map((entry) => entry.value)).toEqual(["Negotiation", "Assign Designer to upload design", "03 Aug 2026, 11:40"]);
    expect(second.people.map((entry) => [entry.key, entry.name])).toEqual([["sales", "Nisha Paul"], ["client", "Farah Khan"]]);

    const firstText = displayedText(first);
    const secondText = displayedText(second);
    for (const value of ["Harbour", "Fort Kochi", "Farah Khan", "farah@example.test", "Apartment", "Nisha Paul", "29,50,000", "31,50,000", "25,00,000", "Version 5", "Estimation Approval", "Confirm kitchen layout", "Negotiation"]) {
      expect(firstText).not.toContain(value);
    }
    for (const value of ["Lakeside", "Whitefield", "asha Rao", "asha@example.test", "Villa", "Ravi Kumar", "Meera Iyer", "21,24,000", "23,60,000", "12,00,000", "Version 3", "Share revised moodboard", "Proposal Sent"]) {
      expect(secondText).not.toContain(value);
    }
    expect(secondText).not.toContain("31,50,000");
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
    expect(first.subtitle).toBe("Client, schedule and progress details");
    expect(first.estimate).toBeNull();
    expect(second.estimate).toBeNull();
    expect(first.overview.map((entry) => [entry.key, entry.label, entry.value])).toEqual([
      ["client", "Client", "Anil Menon"],
      ["plannedEnd", "Planned completion", "30 Jun 2026"],
      ["location", "Location", "Kochi"],
      ["created", "Created", "20 Dec 2025"]
    ]);
    expect(second.overview.map((entry) => [entry.key, entry.value])).toEqual([
      ["client", "Farah Khan"],
      ["plannedEnd", "15 Nov 2025"],
      ["location", "Pune"],
      ["created", "11 Feb 2025"]
    ]);
    expect(first.value).toEqual({ kind: "progress", label: "Overall progress", value: "38%", pill: { label: "On Hold", tone: "on_hold", approved: false } });
    expect(second.value).toEqual({ kind: "progress", label: "Overall progress", value: "100%", pill: { label: "Completed", tone: "completed", approved: false } });
    expect(first.sections).toEqual([
      {
        key: "information",
        title: "Project information",
        subtitle: "Location, status and client contact",
        groups: [
          {
            key: "project", title: "Project", emptyText: null, wide: false, rows: [
              r("location", "Location", "Kochi", "pin"),
              r("status", "Status", "On Hold", "status")
            ]
          },
          {
            key: "client", title: "Client", emptyText: null, wide: false, rows: [
              r("clientName", "Client name", "Anil Menon", "person"),
              r("clientEmail", "Email", "anil@example.test", "mail"),
              r("clientMobile", "Mobile", "+91 90000 00002", "phone"),
              r("clientAddress", "Address", "12 Marine Drive, Kochi", "home")
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
              r("progress", "Progress", "38%", "progress"),
              r("plannedStart", "Planned start", "05 Jan 2026", "calendar"),
              r("plannedEnd", "Planned completion", "30 Jun 2026", "calendarCheck"),
              r("actualStart", "Actual start", "12 Jan 2026", "calendar"),
              r("actualEnd", "Actual completion", "Not recorded", "calendarCheck"),
              r("updated", "Last updated", "02 Mar 2026", "clock")
            ]
          }
        ]
      }
    ]);
    expect(groupOf(second, "schedule", "schedule")?.rows.map((entry) => entry.value)).toEqual([
      "100%", "01 Mar 2025", "15 Nov 2025", "04 Mar 2025", "20 Nov 2025", "21 Nov 2025"
    ]);
    expect(first.people).toEqual([{ key: "client", role: "Client", name: "Anil Menon", detail: "anil@example.test", initial: "A" }]);
    expect(second.people).toEqual([{ key: "client", role: "Client", name: "Farah Khan", detail: "farah@example.test", initial: "F" }]);

    const firstText = displayedText(first);
    const secondText = displayedText(second);
    for (const value of ["Cedar Court", "Pune", "Farah Khan", "farah@example.test", "100%", "15 Nov 2025", "Completed"]) expect(firstText).not.toContain(value);
    for (const value of ["Palm Residency", "Kochi", "Anil Menon", "anil@example.test", "38%", "30 Jun 2026", "On Hold"]) expect(secondText).not.toContain(value);
    for (const result of [first, second]) {
      for (const label of ["Client-approved value (incl. GST)", "Current estimate value (incl. GST)", "Sales", "Initial client budget range", "Property type", "Project status"]) {
        expect(allLabels(result)).not.toContain(label);
      }
    }
  });

  it("keeps the overview client fact but omits the client group and person when staff payloads have no client fields", () => {
    const result = present(hierarchyProject({ clientName: " ", clientEmail: undefined, clientMobile: null, clientAddress: 42 }), "site_manager");
    expect(result.overview.map((entry) => entry.key)).toEqual(["client", "plannedEnd", "location", "created"]);
    expect(overviewRow(result, "client")).toEqual(r("client", "Client", "Not captured", "person"));
    expect(result.sections[0]?.groups.map((entry) => entry.key)).toEqual(["project"]);
    expect(result.people).toEqual([]);
  });

  it("keeps only present staff client contact rows and omits the person without a name", () => {
    const result = present(hierarchyProject({ clientName: null, clientMobile: "", clientAddress: null }), "site_manager");
    expect(groupOf(result, "information", "client")?.rows).toEqual([r("clientEmail", "Email", "anil@example.test", "mail")]);
    expect(overviewRow(result, "client")?.value).toBe("Not captured");
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
    expect(result.subtitle).toBe("Schedule and progress details");
    expect(result.overview.map((entry) => [entry.key, entry.value])).toEqual([
      ["plannedStart", "01 Apr 2026"],
      ["plannedEnd", "31 Oct 2026"],
      ["location", "Chennai"],
      ["created", "15 Mar 2026"]
    ]);
    expect(result.value).toEqual({ kind: "progress", label: "Overall progress", value: "54%", pill: { label: "Active", tone: "active", approved: false } });
    expect(result.estimate).toBeNull();
    expect(result.sections.map((section) => [section.key, section.subtitle, section.groups.map((entry) => entry.key)])).toEqual([
      ["information", "Location and status", ["project"]],
      ["schedule", "Planned dates, actual dates and progress", ["schedule"]]
    ]);
    expect(groupOf(result, "schedule", "schedule")?.rows.filter((entry) => entry.key.startsWith("actual")).map((entry) => entry.value)).toEqual(["Not recorded", "Not recorded"]);
    expect(result.people).toEqual([]);
    const labels = allLabels(result);
    for (const label of ["Client-approved value (incl. GST)", "Current estimate value (incl. GST)", "Sales", "Initial client budget range", "Client", "Client name", "Email", "Mobile", "Address", "Estimate status", "Project status", "Property type", "Approved estimate baseline"]) {
      expect(labels).not.toContain(label);
    }
    const text = displayedText(result);
    for (const value of ["Leaked", "leaked@example.test", "99999", "Ravi Kumar", "₹", "Client Approved", "estimate-internal-1"]) expect(text).not.toContain(value);
  });

  it("never displays ID-only or internal reference fields", () => {
    const staff = present(hierarchyProject(), "design_manager");
    const admin = present(adminProject(), "super_admin");
    for (const value of ["user-designer-7", "user-manager-9", "user-site-9", "floor-1", "Ground floor"]) expect(displayedText(staff)).not.toContain(value);
    for (const value of ["user-sales-1", "user-designer-1", "lead-internal-1", "estimate-internal-1", "round-internal-1", "project-admin-1"]) expect(displayedText(admin)).not.toContain(value);
    expect(staff.id).toBe("project-a");
    expect(admin.id).toBe("project-admin-1");
    expect(admin.estimate?.id).toBe("estimate-internal-1");
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
    expect(valid.overview.map((entry) => entry.value)).toEqual(["Anil Menon", "31 Dec 2026", "Kochi", "21 Sep 2026"]);
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
    expect(present(hierarchyProject({ plannedStartAt: "yesterday", plannedEndAt: "2026-09-22T10:00:00", createdAt: "2026-02-30" }), "client").overview.map((entry) => entry.value)).toEqual([
      "Not captured", "Not captured", "Kochi", "Not captured"
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
    expect(overviewRow(staff, "location")?.value).toBe("Not captured");
    expect(staff.value.value).toBe("Not captured");
    expect(staff.value.pill).toEqual({ label: "Status unavailable", tone: "unknown", approved: false });
    for (const progress of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(present(hierarchyProject({ progress }), "client").value.value).toBe("Not captured");
    }
    expect(present(hierarchyProject({ progress: 0 }), "client").value.value).toBe("0%");
    expect(present(hierarchyProject({ status: "archived" }), "client").status).toEqual({ label: "Archived", tone: "unknown" });
    expect(present(hierarchyProject({ status: "__" }), "client").status).toEqual({ label: "Status unavailable", tone: "unknown" });

    const admin = present(adminProject({
      name: "  ", status: null, client: "Asha", propertyType: 3, budgetMin: -5, budgetMax: 100, estimator: "Ravi", lead: [],
      estimate: estimateWith({ status: "sent_to_client", total: "2360000" })
    }), "admin");
    expect(admin).toMatchObject({ name: "Untitled project", status: { label: "Status unavailable", tone: "unknown" } });
    expect(admin.overview.map((entry) => [entry.key, entry.value, entry.note])).toEqual([
      ["client", "Not captured", null],
      ["propertyType", "Not captured", null],
      ["location", "Whitefield, Bengaluru", null],
      ["created", "22 Sep 2026", null]
    ]);
    expect(admin.value).toEqual({
      kind: "estimate", label: "Current estimate value (incl. GST)", value: "Not captured", pill: { label: "Sent To Client", tone: "unknown", approved: false }
    });
    expect(groupOf(admin, "information", "client")?.rows.map((entry) => entry.value)).toEqual(["Not captured", "Not captured", "Not captured"]);
    expect(groupOf(admin, "assignment", "status")?.rows[0]?.value).toBe("Status unavailable");
    expect(groupOf(admin, "assignment", "sales")?.rows.map((entry) => entry.value)).toEqual(["Unassigned handoff"]);
    expect(groupOf(admin, "assignment", "lead")?.emptyText).toBe("Unassigned handoff");
    expect(estimateRow(admin, "budgetRange")?.value).toBe("Not captured");
    expect(estimateRow(admin, "estimateValue")?.value).toBe("Not captured");
    expect(admin.people.map((entry) => entry.key)).toEqual(["designer"]);
    expect(present(adminProject({ client: {}, estimator: { name: " " }, estimate: null }), "admin").people).toEqual([]);
    expect(present(adminProject({ estimate: estimateWith({ status: null }) }), "admin").value).toEqual({
      kind: "estimate", label: "Current estimate value (incl. GST)", value: "₹23,60,000", pill: null
    });
    expect(present(adminProject({ estimate: estimateWith({ status: "__" }) }), "admin").value.pill).toBeNull();
    expect(present(adminProject({ estimate: "estimate-internal-1" }), "admin").value).toEqual({
      kind: "estimate", label: "Current estimate value (incl. GST)", value: "No estimate yet", pill: null
    });
  });

  it("keeps every key unique, gives every row an icon and independent of display names", () => {
    const fixtures: readonly [unknown, Role][] = [
      [adminProject(), "admin"],
      [adminProject({ estimate: null, lead: null, estimator: null }), "super_admin"],
      [adminProject({ estimate: estimateWith({ status: "draft", approvedBaseline: null }) }), "admin"],
      [hierarchyProject(), "site_manager"],
      [hierarchyProject({ clientName: null, clientEmail: null, clientMobile: null, clientAddress: null }), "designer"],
      [hierarchyProject(), "client"]
    ];
    for (const [data, role] of fixtures) {
      const result = present(data, role);
      expect(result.overview).toHaveLength(4);
      expectUnique(result.overview.map((entry) => entry.key));
      expectUnique(result.people.map((entry) => entry.key));
      expectUnique(result.sections.map((section) => section.key));
      expectUnique(result.sections.flatMap((section) => section.groups.map((entry) => entry.key)));
      expectUnique(result.sections.flatMap((section) => section.groups.flatMap((entry) => entry.rows.map((item) => item.key))));
      expectUnique(result.estimate?.rows.map((entry) => entry.key) ?? []);
      for (const entry of allRows(result)) {
        expect({ key: entry.key, icon: ICONS.has(entry.icon) }).toEqual({ key: entry.key, icon: true });
        expect(entry.note).toBeNull();
      }
    }
    const renamed = present(adminProject({
      client: { name: "Zed Client", email: "zed@example.test", mobile: "1" },
      estimator: { id: "user-sales-2", name: "Another Seller", email: "seller@example.test" },
      estimate: estimateWith({ designPlanDesigner: { id: "user-designer-2", name: "Other Designer", email: "other@example.test" } })
    }), "admin");
    expect(renamed.people.map((entry) => entry.key)).toEqual(present(adminProject(), "admin").people.map((entry) => entry.key));
    expect(renamed.people.map((entry) => entry.key)).toEqual(["sales", "designer", "client"]);
    expect(allRows(renamed).map((entry) => [entry.key, entry.icon])).toEqual(allRows(present(adminProject(), "admin")).map((entry) => [entry.key, entry.icon]));
  });

  it("preserves long values without truncation", () => {
    const longName = `Residence ${"with an unusually long descriptive name ".repeat(8).trim()}`;
    const longLocation = `${"Tower 7, Phase 3, Outer Ring Road Service Lane, ".repeat(6).trim()} Bengaluru 560103`;
    const longEmail = `${"very.long.client.mailbox.segment.".repeat(4)}owner@example.test`;
    const staff = present(hierarchyProject({ name: `  ${longName}  `, location: longLocation, clientName: longName, clientEmail: longEmail }), "site_manager");
    expect(staff.name).toBe(longName);
    expect(overviewRow(staff, "location")?.value).toBe(longLocation);
    expect(overviewRow(staff, "client")?.value).toBe(longName);
    expect(groupOf(staff, "information", "client")?.rows.find((entry) => entry.key === "clientEmail")?.value).toBe(longEmail);
    expect(staff.people[0]).toMatchObject({ name: longName, detail: longEmail, initial: "R" });

    const admin = present(adminProject({ name: longName, location: longLocation, client: { name: longName, email: longEmail, mobile: "+91 90000 00001" } }), "admin");
    expect(admin.name).toBe(longName);
    expect(groupOf(admin, "information", "project")?.rows[0]?.value).toBe(longLocation);
    expect(overviewRow(admin, "client")?.value).toBe(longName);
    expect(overviewRow(admin, "location")?.value).toBe(longLocation);
    expect(groupOf(admin, "information", "client")?.rows.find((entry) => entry.key === "clientEmail")?.value).toBe(longEmail);
  });
});

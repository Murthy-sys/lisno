import type { Role } from "../../contracts/authorization";

export type ProjectDetailKind = "admin" | "staff" | "client";
export type ProjectDetailTone = "planning" | "active" | "on_hold" | "completed" | "approval" | "unknown";

export interface ProjectDetailRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

export interface ProjectDetailGroup {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly ProjectDetailRow[];
  readonly emptyText: string | null;
  readonly wide: boolean;
}

export interface ProjectDetailSection {
  readonly key: "information" | "assignment" | "schedule";
  readonly title: string;
  readonly subtitle: string;
  readonly groups: readonly ProjectDetailGroup[];
}

export interface ProjectDetailPerson {
  readonly key: string;
  readonly role: string;
  readonly name: string;
  readonly detail: string | null;
  readonly initial: string;
}

export interface ProjectDetailPresentation {
  readonly kind: ProjectDetailKind;
  readonly id: string | null;
  readonly name: string;
  readonly description: string;
  readonly status: { readonly label: string; readonly tone: ProjectDetailTone };
  readonly created: { readonly label: string; readonly iso: string | null };
  readonly facts: readonly ProjectDetailRow[];
  readonly sections: readonly ProjectDetailSection[];
  readonly summary: readonly ProjectDetailRow[];
  readonly people: readonly ProjectDetailPerson[];
}

const NOT_CAPTURED = "Not captured";
const NOT_RECORDED = "Not recorded";
const NO_ESTIMATE = "No estimate yet";
const UNASSIGNED_HANDOFF = "Unassigned handoff";
const BASELINE_UNAVAILABLE = "Approved baseline unavailable";
const STATUS_UNAVAILABLE = "Status unavailable";
const ESTIMATION_APPROVAL_STATUS = "Estimation Approval";
const ASSIGN_DESIGNER_NEXT_ACTION = "Assign Designer to upload design";
const APPROVED_ESTIMATE_LABEL = "Client-approved value (incl. GST)";
const CURRENT_ESTIMATE_LABEL = "Current estimate value (incl. GST)";
const BUDGET_RANGE_LABEL = "Initial client budget range";

const DESCRIPTIONS: Readonly<Record<ProjectDetailKind, string>> = {
  admin: "Commercial handoff, estimate and delivery details for this project.",
  staff: "Delivery schedule, progress and project structure.",
  client: "Your project schedule and progress."
};

/** Fixed English abbreviations keep dates identical across ICU versions ("Sep", never "Sept"). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Whole-rupee INR, matching the web project detail page. */
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Date-only values, or timestamps with an explicit zone so parsing never depends on the device timezone. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectRecord(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  return isRecord(data.project) ? data.project : data;
}

function presentText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** "on_hold" -> "On Hold", as on the web; empty segments are dropped instead of rendering "undefined". */
export function formatWorkflowLabel(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function workflowText(value: unknown): string | null {
  const source = presentText(value);
  if (!source) return null;
  const label = formatWorkflowLabel(source).trim();
  return label ? label : null;
}

function formatMoney(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? money.format(value) : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

function presentDate(value: unknown, fallback: string = NOT_CAPTURED): string {
  const date = parseDate(value);
  return date ? formatDate(date) : fallback;
}

function presentDateTime(value: unknown): string {
  const date = parseDate(value);
  return date ? `${formatDate(date)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` : NOT_CAPTURED;
}

function presentProgress(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? `${Math.round(value)}%`
    : NOT_CAPTURED;
}

function statusTone(value: unknown): ProjectDetailTone {
  return value === "planning" || value === "active" || value === "on_hold" || value === "completed" ? value : "unknown";
}

function presentStatus(value: unknown, approvalPending: boolean): ProjectDetailPresentation["status"] {
  if (approvalPending) return { label: ESTIMATION_APPROVAL_STATUS, tone: "approval" };
  const label = workflowText(value);
  return label ? { label, tone: statusTone(value) } : { label: STATUS_UNAVAILABLE, tone: "unknown" };
}

function row(key: string, label: string, value: string, note: string | null = null): ProjectDetailRow {
  return { key, label, value, note };
}

function group(
  key: string,
  title: string,
  rows: readonly ProjectDetailRow[],
  options: { readonly emptyText?: string | null; readonly wide?: boolean } = {}
): ProjectDetailGroup {
  return { key, title, rows, emptyText: options.emptyText ?? null, wide: options.wide ?? false };
}

function person(key: string, role: string, name: unknown, detail: unknown): ProjectDetailPerson | null {
  const displayName = presentText(name);
  if (!displayName) return null;
  const first = Array.from(displayName)[0] ?? "";
  return { key, role, name: displayName, detail: presentText(detail), initial: first.toUpperCase() };
}

function namedPeople(people: readonly (ProjectDetailPerson | null)[]): readonly ProjectDetailPerson[] {
  return people.filter((entry): entry is ProjectDetailPerson => entry !== null);
}

interface ProjectHeader {
  readonly id: string | null;
  readonly name: string;
  readonly created: ProjectDetailPresentation["created"];
}

function presentHeader(project: Record<string, unknown>): ProjectHeader {
  const createdAt = project.createdAt;
  const createdDate = parseDate(createdAt);
  return {
    id: presentText(project.id),
    name: presentText(project.name) ?? "Untitled project",
    created: {
      label: createdDate ? formatDate(createdDate) : NOT_CAPTURED,
      iso: createdDate && typeof createdAt === "string" ? createdAt : null
    }
  };
}

/** Admin summary (`GET /admin/projects/:id`): ports the web label rules without reading ID-only fields. */
function presentAdmin(project: Record<string, unknown>, header: ProjectHeader): ProjectDetailPresentation {
  const client = isRecord(project.client) ? project.client : {};
  const clientName = presentText(client.name);
  const location = presentText(project.location) ?? NOT_CAPTURED;
  const propertyType = presentText(project.propertyType) ?? NOT_CAPTURED;
  const estimator = isRecord(project.estimator) ? project.estimator : null;
  const lead = isRecord(project.lead) ? project.lead : null;
  const estimate = isRecord(project.estimate) ? project.estimate : null;

  const approved = estimate?.status === "client_approved";
  const designPlanStatus = estimate?.designPlanStatus;
  const assignmentPending = approved &&
    (designPlanStatus === undefined || designPlanStatus === null || designPlanStatus === "pending_assignment");

  // The approved value comes only from the immutable baseline, never from the mutable estimate total.
  const rawBaseline = approved && estimate ? estimate.approvedBaseline : null;
  const baseline = isRecord(rawBaseline) ? rawBaseline : null;
  const baselineTotal = baseline ? formatMoney(baseline.total) : null;
  const baselineVersion = baseline && baselineTotal ? positiveInteger(baseline.estimateVersion) : null;

  const estimateLabel = approved ? APPROVED_ESTIMATE_LABEL : CURRENT_ESTIMATE_LABEL;
  const estimateValue = approved
    ? baselineTotal ?? BASELINE_UNAVAILABLE
    : estimate ? formatMoney(estimate.total) ?? NOT_CAPTURED : NO_ESTIMATE;
  const estimateStatus = estimate ? workflowText(estimate.status) : null;
  const estimateStatusLabel = estimate ? estimateStatus ?? NOT_CAPTURED : NO_ESTIMATE;

  const budgetMin = formatMoney(project.budgetMin);
  const budgetMax = formatMoney(project.budgetMax);
  const budgetRange = budgetMin && budgetMax ? `${budgetMin} – ${budgetMax}` : NOT_CAPTURED;
  const status = presentStatus(project.status, assignmentPending);
  const designer = estimate && isRecord(estimate.designPlanDesigner) ? estimate.designPlanDesigner : null;

  return {
    kind: "admin",
    ...header,
    description: DESCRIPTIONS.admin,
    status,
    facts: [
      row("client", "Client", clientName ?? NOT_CAPTURED),
      row("location", "Location", location),
      row("propertyType", "Property type", propertyType),
      row("created", "Created", header.created.label),
      row("estimate", estimateLabel, estimateValue, estimate && !approved ? estimateStatus : null)
    ],
    sections: [
      {
        key: "information",
        title: "Project information",
        subtitle: "Client, property and budget details",
        groups: [
          group("project", "Project", [
            row("location", "Location", location),
            row("propertyType", "Property type", propertyType),
            row("budgetRange", BUDGET_RANGE_LABEL, budgetRange)
          ]),
          group("client", "Client", [
            row("clientName", "Name", clientName ?? NOT_CAPTURED),
            row("clientEmail", "Email", presentText(client.email) ?? NOT_CAPTURED),
            row("clientMobile", "Mobile", presentText(client.mobile) ?? NOT_CAPTURED)
          ])
        ]
      },
      {
        key: "assignment",
        title: "Assignment & progress",
        subtitle: "Sales assignment and lead progress",
        groups: [
          group("sales", "Sales", estimator
            ? [
                row("salesAssignee", "Assigned to", presentText(estimator.name) ?? NOT_CAPTURED),
                row("salesEmail", "Email", presentText(estimator.email) ?? NOT_CAPTURED)
              ]
            : [row("salesAssignee", "Assigned to", UNASSIGNED_HANDOFF)]),
          group("lead", "Lead progress", lead
            ? [
                row("leadStage", "Stage", workflowText(lead.stage) ?? NOT_CAPTURED),
                row("leadNextAction", "Next action", assignmentPending ? ASSIGN_DESIGNER_NEXT_ACTION : presentText(lead.nextAction) ?? NOT_CAPTURED),
                row("leadNextActionAt", "Next action date", presentDateTime(lead.nextActionAt))
              ]
            : [], { emptyText: lead ? null : UNASSIGNED_HANDOFF }),
          group("estimate", "Estimate", estimate
            ? [
                row("estimateStatus", "Status", estimateStatusLabel),
                row("estimateValue", estimateLabel, estimateValue),
                ...(baselineVersion !== null ? [row("estimateBaseline", "Approved estimate baseline", `Version ${baselineVersion}`)] : [])
              ]
            : [], { emptyText: estimate ? null : NO_ESTIMATE, wide: true })
        ]
      }
    ],
    summary: [
      row("projectStatus", "Project status", status.label),
      row("estimateStatus", "Estimate status", estimateStatusLabel),
      row("estimateValue", estimateLabel, estimateValue),
      row("budgetRange", BUDGET_RANGE_LABEL, budgetRange)
    ],
    people: namedPeople([
      estimator ? person("sales", "Sales", estimator.name, estimator.email) : null,
      designer ? person("designer", "Designer", designer.name, designer.email) : null,
      person("client", "Client", client.name, client.email)
    ])
  };
}

/** Project hierarchy (`GET /projects/:id`): staff see client contact; the client view never reads it. */
function presentHierarchy(project: Record<string, unknown>, header: ProjectHeader, kind: "staff" | "client"): ProjectDetailPresentation {
  const location = presentText(project.location) ?? NOT_CAPTURED;
  const status = presentStatus(project.status, false);
  const progress = presentProgress(project.progress);
  const plannedEnd = presentDate(project.plannedEndAt);
  const updated = presentDate(project.updatedAt);
  const clientName = kind === "staff" ? presentText(project.clientName) : null;
  const clientRows = kind === "staff"
    ? [
        clientName ? row("clientName", "Name", clientName) : null,
        ...([
          ["clientEmail", "Email", project.clientEmail],
          ["clientMobile", "Mobile", project.clientMobile],
          ["clientAddress", "Address", project.clientAddress]
        ] as const).map(([key, label, value]) => {
          const text = presentText(value);
          return text ? row(key, label, text) : null;
        })
      ].filter((entry): entry is ProjectDetailRow => entry !== null)
    : [];

  return {
    kind,
    ...header,
    description: DESCRIPTIONS[kind],
    status,
    facts: [
      ...(clientName ? [row("client", "Client", clientName)] : []),
      row("location", "Location", location),
      row("created", "Created", header.created.label),
      row("progress", "Progress", progress),
      row("plannedEnd", "Planned completion", plannedEnd)
    ],
    sections: [
      {
        key: "information",
        title: "Project information",
        subtitle: kind === "staff" ? "Location, status and client contact" : "Location and status",
        groups: [
          group("project", "Project", [
            row("location", "Location", location),
            row("status", "Status", status.label)
          ]),
          ...(clientRows.length > 0 ? [group("client", "Client", clientRows)] : [])
        ]
      },
      {
        key: "schedule",
        title: "Schedule & progress",
        subtitle: "Planned dates, actual dates and progress",
        groups: [
          group("schedule", "Schedule", [
            row("progress", "Progress", progress),
            row("plannedStart", "Planned start", presentDate(project.plannedStartAt)),
            row("plannedEnd", "Planned completion", plannedEnd),
            row("actualStart", "Actual start", presentDate(project.actualStartAt, NOT_RECORDED)),
            row("actualEnd", "Actual completion", presentDate(project.actualEndAt, NOT_RECORDED)),
            row("updated", "Last updated", updated)
          ], { wide: true })
        ]
      }
    ],
    summary: [
      row("projectStatus", "Project status", status.label),
      row("progress", "Progress", progress),
      row("plannedEnd", "Planned completion", plannedEnd),
      row("updated", "Last updated", updated)
    ],
    people: kind === "staff" ? namedPeople([person("client", "Client", project.clientName, project.clientEmail)]) : []
  };
}

function detailKind(role: Role): ProjectDetailKind {
  if (role === "admin" || role === "super_admin") return "admin";
  return role === "client" ? "client" : "staff";
}

/**
 * Normalizes the project detail data payload (after the API client unwraps the envelope) into display values.
 * The endpoint, and therefore the payload shape, is chosen by role. Returns null when the data is not a record.
 */
export function presentProjectDetail(data: unknown, role: Role): ProjectDetailPresentation | null {
  const project = projectRecord(data);
  if (!project) return null;
  const header = presentHeader(project);
  const kind = detailKind(role);
  return kind === "admin" ? presentAdmin(project, header) : presentHierarchy(project, header, kind);
}

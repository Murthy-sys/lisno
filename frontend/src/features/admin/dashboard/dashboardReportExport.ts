import type { DashboardValueTable } from "./dashboardViewModel";
import { DASHBOARD_TABS, type DashboardPeriod, type DashboardTab } from "./superAdminDashboardApi";

export interface DashboardReportSection {
  id: string;
  label: string;
  state: "ready" | "loading" | "stale" | "unavailable";
  dataQuality?: "complete" | "partial";
  observedAt: string | null;
  fetchedAt: string | null;
  period: DashboardPeriod | null;
  reason?: string;
  pagination?: { offset: number; limit: number; total: number; loaded: number };
  tables: DashboardValueTable[];
}

export interface DashboardReportInput {
  tab: DashboardTab;
  requestedPeriodDays: number;
  comparisonEnabled: boolean;
  exportedAt: string;
  filters: Record<string, string | number | boolean | null | undefined>;
  sections: DashboardReportSection[];
}

type CsvCell = string | number | boolean | null | undefined;
const UNKNOWN = "Not available";
const FORMULA_PREFIX = /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u;

function csvCell(value: CsvCell): string {
  // Numeric cells are deliberately distinct from untrusted strings, including negative amounts.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = value === null || value === undefined || typeof value === "number"
    ? UNKNOWN
    : String(value);
  // Include invisible controls and compatibility characters when detecting a formula prefix.
  // Preserve the original text and its whitespace after adding a spreadsheet text marker.
  const safe = FORMULA_PREFIX.test(text.normalize("NFKC")) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Serialize only the presentation tables supplied for the current authorized view. */
export function buildDashboardReportCsv(input: DashboardReportInput): string {
  const rows: CsvCell[][] = [
    ["Lisno dashboard report"],
    ["Active tab", input.tab],
    ["Requested period (days)", input.requestedPeriodDays],
    ["Comparison", input.comparisonEnabled ? "Enabled" : "Disabled"],
    ["Exported at (UTC)", input.exportedAt],
    ["Observation context", "Sections are loaded independently; this report is not a single transactional snapshot."],
    [],
    ["Applied detail filters"]
  ];
  const filters = Object.entries(input.filters).filter(([, value]) => value !== undefined);
  if (filters.length) rows.push(...filters.map(([key, value]) => [key, value]));
  else rows.push(["None"]);

  for (const section of input.sections) {
    rows.push(
      [],
      ["Section", section.label],
      ["Section ID", section.id],
      ["State", section.state],
      ["Data quality", section.dataQuality ?? UNKNOWN],
      ["Observed at (UTC)", section.observedAt],
      ["Fetched at (UTC)", section.fetchedAt],
      ["Resolved period (days)", section.period?.days],
      ["Period start (UTC)", section.period?.startAt],
      ["Period end (UTC)", section.period?.endAt]
    );
    if (section.reason) rows.push(["Availability / freshness note", section.reason]);
    if (section.pagination) {
      rows.push(
        ["Row scope", "Current page only; not the full matching dataset."],
        ["Page offset (zero-based)", section.pagination.offset],
        ["Page limit", section.pagination.limit],
        ["Rows loaded", section.pagination.loaded],
        ["Total matching records", section.pagination.total]
      );
    }
    for (const table of section.tables) {
      rows.push([], ["Table", table.title], table.columns, ...table.rows);
      if (!table.rows.length) rows.push(["No loaded rows"]);
    }
  }
  // UTF-8 BOM preserves international names and currency characters in spreadsheet apps.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function reportFilename(input: DashboardReportInput): string {
  const tab = DASHBOARD_TABS.includes(input.tab) ? input.tab : "dashboard";
  const timestamp = new Date(input.exportedAt);
  const date = Number.isNaN(timestamp.getTime()) ? "undated" : timestamp.toISOString().slice(0, 10);
  return `Lisno-${tab}-report-${date}.csv`;
}

/** Initiate a local browser download without writing or uploading dashboard data. */
export function downloadDashboardReport(input: DashboardReportInput): void {
  let anchor: HTMLAnchorElement | undefined;
  let url: string | undefined;
  let started = false;
  try {
    const csv = buildDashboardReportCsv(input);
    anchor = document.createElement("a");
    url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    anchor.href = url;
    anchor.download = reportFilename(input);
    document.body.append(anchor);
    anchor.click();
    started = true;
  } catch {
    throw new Error("The report could not be downloaded. Try again.");
  } finally {
    anchor?.remove();
    if (url) {
      const objectUrl = url;
      if (started) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      else URL.revokeObjectURL(objectUrl);
    }
  }
}

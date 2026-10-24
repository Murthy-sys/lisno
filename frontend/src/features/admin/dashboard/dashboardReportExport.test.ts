import { afterEach, describe, expect, it, vi } from "vitest";

import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import {
  buildDashboardReportCsv,
  downloadDashboardReport,
  type DashboardReportInput,
  type DashboardReportSection
} from "./dashboardReportExport";
import { metricsTable } from "./dashboardViewModel";
import { DASHBOARD_TABS } from "./superAdminDashboardApi";

const section = (overrides: Partial<DashboardReportSection> = {}): DashboardReportSection => ({
  id: "finance-summary",
  label: "Finance summary",
  state: "ready",
  dataQuality: "complete",
  observedAt: "2026-10-23T10:00:00.000Z",
  fetchedAt: "2026-10-23T10:00:05.000Z",
  period: { days: 7, startAt: "2026-10-17T00:00:00.000Z", endAt: "2026-10-23T10:00:00.000Z" },
  tables: [{
    title: "Recorded expenses over time",
    columns: ["UTC date", "Recorded expenses (INR)"],
    rows: [["2026-10-21", 1234.56], ["2026-10-22", 789.12], ["2026-10-23", 0]]
  }],
  ...overrides
});

const report = (overrides: Partial<DashboardReportInput> = {}): DashboardReportInput => ({
  tab: "finance",
  requestedPeriodDays: 7,
  comparisonEnabled: true,
  exportedAt: "2026-10-23T10:01:00.000Z",
  filters: { module: "finance", search: "Atrium", sort: "risk_desc", offset: 20 },
  sections: [section()],
  ...overrides
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("dashboard report CSV", () => {
  it.each(DASHBOARD_TABS)("exports %s with its supplied view metrics and active-tab metadata", (tab) => {
    const csv = buildDashboardReportCsv(report({
      tab,
      sections: [section({ tables: [metricsTable(tab, superAdminDashboardOverviewFixture)] })]
    }));
    expect(csv).toContain(`"Active tab","${tab}"\r\n`);
    expect(csv).toContain('"Requested period (days)",7\r\n');
    expect(csv).toContain('"Comparison","Enabled"\r\n');
    expect(csv).toContain('"Exported at (UTC)","2026-10-23T10:01:00.000Z"');
    expect(csv).toContain('"Applied detail filters"\r\n"module","finance"');
    expect(csv).toContain('"search","Atrium"\r\n');
    expect(csv).toContain('"offset",20\r\n');
    expect(csv).toContain(`"${metricsTable(tab, superAdminDashboardOverviewFixture).title}"`);
  });

  it("preserves exact plotted values, explicit INR units, signed numbers and prepared formatted summaries", () => {
    const csv = buildDashboardReportCsv(report({ sections: [section({ tables: [
      ...section().tables,
      { title: "Finance details", columns: ["Project", "Current profit (INR)", "Approved net value (INR)"], rows: [
        ["Atrium", -1234.56, 25100.23], ["Courtyard", 789.12, 61800.71]
      ] },
      { title: "Displayed summary", columns: ["Metric", "Value"], rows: [["Current profit", "-₹1,234.56"]] }
    ] })] }));
    expect(csv).toContain('"Recorded expenses (INR)"');
    expect(csv).toContain('"2026-10-21",1234.56\r\n"2026-10-22",789.12\r\n"2026-10-23",0');
    expect(csv).toContain('"Atrium",-1234.56,25100.23');
    expect(csv).toContain('"Courtyard",789.12,61800.71');
    expect(csv).toContain('"Current profit","\'-₹1,234.56"');
    expect(csv).not.toContain("NaN");
    expect(csv).not.toContain("undefined");
  });

  it("records independent observation times, unknown vendor time and stale partial current-page scope", () => {
    const csv = buildDashboardReportCsv(report({ sections: [
      section(),
      section({
        id: "project-page", label: "Projects on current page", state: "stale", dataQuality: "partial",
        observedAt: "2026-10-23T09:45:00.000Z", fetchedAt: "2026-10-23T09:45:02.000Z",
        reason: "The latest refresh failed; two rows could not be verified.",
        pagination: { offset: 20, limit: 20, total: 43, loaded: 18 }, tables: []
      }),
      section({ id: "vendor-requests", label: "Vendor requests", observedAt: null, fetchedAt: "2026-10-23T09:40:00.000Z", period: null, tables: [] })
    ] }));
    expect(csv).toContain("Sections are loaded independently");
    expect(csv).toContain('"Observed at (UTC)","2026-10-23T10:00:00.000Z"');
    expect(csv).toContain('"State","stale"\r\n"Data quality","partial"');
    expect(csv).toContain('"Observed at (UTC)","2026-10-23T09:45:00.000Z"');
    expect(csv).toContain('"Observed at (UTC)","Not available"\r\n"Fetched at (UTC)","2026-10-23T09:40:00.000Z"');
    expect(csv).toContain('"Resolved period (days)","Not available"');
    expect(csv).toContain('"Period start (UTC)","2026-10-17T00:00:00.000Z"');
    expect(csv).toContain('"Period end (UTC)","2026-10-23T10:00:00.000Z"');
    expect(csv).toContain('"Availability / freshness note","The latest refresh failed; two rows could not be verified."');
    expect(csv).toContain('"Row scope","Current page only; not the full matching dataset."');
    expect(csv).toContain('"Page offset (zero-based)",20\r\n"Page limit",20\r\n"Rows loaded",18\r\n"Total matching records",43');
  });

  it("distinguishes zero, missing and unavailable values without inventing loaded rows", () => {
    const csv = buildDashboardReportCsv(report({
      comparisonEnabled: false,
      filters: { ignored: undefined },
      sections: [section({ state: "unavailable", dataQuality: undefined, observedAt: null, fetchedAt: null, period: null,
        reason: "No authoritative data is available.", tables: [
          { title: "Metrics", columns: ["Metric", "Value"], rows: [["Zero", 0], ["Missing", null], ["Invalid", Number.NaN], ["Overflow", Number.POSITIVE_INFINITY]] },
          { title: "Current page", columns: ["Project"], rows: [] }
        ] })]
    }));
    expect(csv).toContain('"Comparison","Disabled"');
    expect(csv).toContain('"Applied detail filters"\r\n"None"');
    expect(csv).not.toContain("ignored");
    expect(csv).toContain('"Zero",0');
    expect(csv).toContain('"Missing","Not available"');
    expect(csv).toContain('"Invalid","Not available"');
    expect(csv).toContain('"Overflow","Not available"');
    expect(csv).toContain('"Current page"\r\n"Project"\r\n"No loaded rows"');
    expect(csv).toContain('"State","unavailable"');
  });

  it("preserves Unicode and escapes delimiters, quotes and embedded newlines", () => {
    const csv = buildDashboardReportCsv(report({ sections: [section({ tables: [{
      title: "Project values", columns: ["Name", "Status"], rows: [["கட்டிடம், \"Atrium\"\r\nLevel 1", "Ready\nfor review"]]
    }] })] }));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain('"கட்டிடம், ""Atrium""\r\nLevel 1","Ready\nfor review"\r\n');
  });

  it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "  =1+1", "\t=1+1", "\r\n+1", "\u0000-1", "\u200b@A1", "\uFEFF=1", "\u00a0=1", "＝1+1"])(
    "neutralizes untrusted spreadsheet formulas including invisible prefixes: %j", (text) => {
      const csv = buildDashboardReportCsv(report({
        filters: { search: text },
        sections: [section({ tables: [{ title: text, columns: [text], rows: [[text, -5]] }] })]
      }));
      expect(csv).toContain(`"search","'${text}"`);
      expect(csv).toContain(`"Table","'${text}"`);
      expect(csv).toContain(`"'${text}",-5`);
    }
  );

  it("serializes only supplied table data and metadata without spreading unrelated payload fields", () => {
    const input = { ...report(), privateUrl: "https://private.invalid/token", secret: "hidden-token", sections: [
      { ...section(), rawResponse: { privateUrl: "https://private.invalid/other" }, hiddenCount: 999 }
    ] };
    const csv = buildDashboardReportCsv(input);
    expect(csv).not.toContain("private.invalid");
    expect(csv).not.toContain("hidden-token");
    expect(csv).not.toContain("hiddenCount");
    expect(csv).not.toContain("rawResponse");
  });
});

describe("dashboard report download", () => {
  it("downloads a UTF-8 CSV with a safe filename and releases its object URL", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:dashboard-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked = this; });

    downloadDashboardReport(report());

    expect(clicked?.download).toBe("Lisno-finance-report-2026-10-23.csv");
    expect(clicked?.href).toBe("blob:dashboard-report");
    expect(clicked?.isConnected).toBe(false);
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(expect.any(Blob));
    expect(createObjectURL.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:dashboard-report");
  });

  it("returns a safe explicit error and cleans up when the browser rejects a download", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:rejected-report"; static revokeObjectURL = revokeObjectURL; });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("Untrusted internal error with private token"); });
    expect(() => downloadDashboardReport(report())).toThrow("The report could not be downloaded. Try again.");
    expect(document.querySelector('a[href="blob:rejected-report"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:rejected-report");
  });

  it("does not append an anchor when object URL creation is unavailable", () => {
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => { throw new Error("Unavailable"); }; });
    const append = vi.spyOn(document.body, "append");
    expect(() => downloadDashboardReport(report())).toThrow("The report could not be downloaded. Try again.");
    expect(append).not.toHaveBeenCalled();
  });

  it("uses a deterministic safe filename if timestamp metadata is unavailable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:undated-report"; static revokeObjectURL = vi.fn(); });
    let filename: string | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    downloadDashboardReport(report({ exportedAt: "../invalid:date" }));
    expect(filename).toBe("Lisno-finance-report-undated.csv");
    await vi.advanceTimersByTimeAsync(1000);
  });
});

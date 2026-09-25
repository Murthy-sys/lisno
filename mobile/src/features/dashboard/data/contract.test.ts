import {
  DASHBOARD_PERIODS,
  InvalidDashboardResponseError,
  isDashboardPeriod,
  parseDashboardOverview
} from "./contract";
import {
  cloneDashboardFixture,
  createDashboardOverviewFixture,
  createOverspendDashboardOverviewFixture,
  createPartialDashboardOverviewFixture,
  createUnavailableDashboardOverviewFixture
} from "./testFixtures";

describe("dashboard overview contract", () => {
  it("offers exactly the 7-day, 30-day and 1-year selector periods", () => {
    expect(DASHBOARD_PERIODS).toEqual([7, 30, 365]);
    expect(isDashboardPeriod(30)).toBe(true);
    expect(isDashboardPeriod(365)).toBe(true);
    expect(isDashboardPeriod(90)).toBe(false);
  });

  it.each([7, 30, 90, 365] as const)("parses the complete %d-day backend shape", (period) => {
    const parsed = parseDashboardOverview(createDashboardOverviewFixture(period));

    expect(parsed.period.days).toBe(period);
    expect(parsed.comparison.currentBuckets).toHaveLength(period);
    expect(parsed.comparison.previousBuckets).toHaveLength(period);
    expect(parsed.comparison.metrics.recorded_expenses_paise.unit).toBe("paise");
  });

  it("preserves explicit partial and unavailable states", () => {
    const partial = parseDashboardOverview(createPartialDashboardOverviewFixture());
    const unavailable = parseDashboardOverview(createUnavailableDashboardOverviewFixture());

    expect(partial.clients.registeredAccounts).toBeNull();
    expect(partial.clients.accountsStatus).toBe("unavailable");
    expect(unavailable.comparison.metrics.projects_created.current).toBeNull();
    expect(unavailable.comparison.metrics.projects_created.changeKind).toBe("unavailable");
  });

  it("accepts signed backend finance results without clamping overspend", () => {
    const parsed = parseDashboardOverview(createOverspendDashboardOverviewFixture());

    expect(parsed.finance.remainingBudgetPaise).toBe(-2_000_000);
    expect(parsed.finance.currentProfitPaise).toBe(-1_250_000);
    expect(parsed.finance.currentMarginBps).toBe(-676);
  });

  it("rejects malformed required structure with a safe fixed error", () => {
    const missingWindow = cloneDashboardFixture(createDashboardOverviewFixture()) as unknown as Record<string, unknown>;
    delete (missingWindow.comparison as Record<string, unknown>).window;

    expect(() => parseDashboardOverview(missingWindow)).toThrow(InvalidDashboardResponseError);
    expect(() => parseDashboardOverview(missingWindow)).toThrow(
      "The dashboard service returned an invalid response."
    );
  });

  it("rejects mixed units, non-UTC dates, discontinuous buckets, and unknown fields", () => {
    const wrongUnit = cloneDashboardFixture(createDashboardOverviewFixture());
    wrongUnit.comparison.metrics.projects_created.unit = "paise";

    const localTimestamp = cloneDashboardFixture(createDashboardOverviewFixture()) as unknown as {
      observedAt: string;
    };
    localTimestamp.observedAt = "2026-09-22T16:00:00+05:30";

    const discontinuous = cloneDashboardFixture(createDashboardOverviewFixture());
    discontinuous.comparison.currentBuckets[2]!.dayIndex = 8;

    const withUnknown = {
      ...cloneDashboardFixture(createDashboardOverviewFixture()),
      syntheticForecast: 42
    };

    expect(() => parseDashboardOverview(wrongUnit)).toThrow(InvalidDashboardResponseError);
    expect(() => parseDashboardOverview(localTimestamp)).toThrow(InvalidDashboardResponseError);
    expect(() => parseDashboardOverview(discontinuous)).toThrow(InvalidDashboardResponseError);
    expect(() => parseDashboardOverview(withUnknown)).toThrow(InvalidDashboardResponseError);
  });

  it("rejects comparison availability contradictions", () => {
    const value = cloneDashboardFixture(createDashboardOverviewFixture());
    value.comparison.metrics.clients_created.currentStatus = "unavailable";

    expect(() => parseDashboardOverview(value)).toThrow(InvalidDashboardResponseError);
  });
});

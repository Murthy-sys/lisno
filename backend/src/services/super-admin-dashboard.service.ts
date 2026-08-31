import type {
  DashboardPeriod,
  DashboardProjectFilters,
  DashboardWorkforceFilters,
  SuperAdminDashboardOverview,
  SuperAdminDashboardProjectsPage,
  SuperAdminDashboardWorkforcePage
} from "../contracts/super-admin-dashboard.js";
import { ApiError } from "../middleware/errors.js";
import type { AppRepository, DashboardPageResult } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { Clock } from "./workflow.js";

export interface SuperAdminDashboardService {
  overview(actor: PublicUser, periodDays: 7 | 30 | 90): Promise<SuperAdminDashboardOverview>;
  projects(
    actor: PublicUser,
    periodDays: 7 | 30 | 90,
    filters: DashboardProjectFilters
  ): Promise<SuperAdminDashboardProjectsPage>;
  workforce(
    actor: PublicUser,
    periodDays: 7 | 30 | 90,
    filters: DashboardWorkforceFilters
  ): Promise<SuperAdminDashboardWorkforcePage>;
}

export function createSuperAdminDashboardService(
  repository: AppRepository,
  clock: Clock
): SuperAdminDashboardService {
  return {
    async overview(actor, periodDays) {
      await requireSoleActiveSuperAdmin(repository, actor);
      const observedAt = clock();
      const reportingPeriod = dashboardPeriod(observedAt, periodDays);
      return repository.readSuperAdminDashboardOverview({
        observedAt: observedAt.toISOString(),
        startAt: reportingPeriod.startAt,
        endAt: reportingPeriod.endAt,
        periodDays
      });
    },

    async projects(actor, periodDays, filters) {
      await requireSoleActiveSuperAdmin(repository, actor);
      const observedAt = clock();
      const reportingPeriod = dashboardPeriod(observedAt, periodDays);
      const page = await repository.pageSuperAdminDashboardProjects(
        observedAt.toISOString(),
        filters
      );
      return dashboardPage(
        observedAt,
        reportingPeriod,
        filters,
        page
      );
    },

    async workforce(actor, periodDays, filters) {
      await requireSoleActiveSuperAdmin(repository, actor);
      const observedAt = clock();
      const reportingPeriod = dashboardPeriod(observedAt, periodDays);
      const page = await repository.pageSuperAdminDashboardWorkforce({
        observedAt: observedAt.toISOString(),
        startAt: reportingPeriod.startAt,
        endAt: reportingPeriod.endAt,
        periodDays,
        filters
      });
      return dashboardPage(
        observedAt,
        reportingPeriod,
        filters,
        page
      );
    }
  };
}

async function requireSoleActiveSuperAdmin(
  repository: AppRepository,
  actor: PublicUser
): Promise<void> {
  const stored = await repository.findUserById(actor.id);
  if (
    !stored ||
    !stored.active ||
    stored.role !== "super_admin" ||
    await repository.countActiveUsersByRole("super_admin") !== 1
  ) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
}

function dashboardPeriod(observedAt: Date, days: 7 | 30 | 90): DashboardPeriod {
  const start = new Date(Date.UTC(
    observedAt.getUTCFullYear(),
    observedAt.getUTCMonth(),
    observedAt.getUTCDate()
  ));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    days,
    startAt: start.toISOString(),
    endAt: observedAt.toISOString()
  };
}

function dashboardPage<T>(
  observedAt: Date,
  period: DashboardPeriod,
  pagination: { limit: number; offset: number },
  page: DashboardPageResult<T>
) {
  return {
    observedAt: observedAt.toISOString(),
    period,
    items: page.items,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total: page.total,
      hasMore: pagination.offset + page.items.length < page.total
    },
    dataQuality: page.dataQuality
  };
}

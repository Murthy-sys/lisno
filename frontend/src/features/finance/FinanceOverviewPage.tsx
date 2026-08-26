import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  ReceiptText,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, type ReactNode } from "react";

import type {
  ProjectFinanceBucket,
  ProjectFinancePortfolioSummary
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  FinanceKpis,
  formatBps,
  formatPaise
} from "./ProjectFinancePanel";
import { getProjectFinanceBuckets, projectFinanceKeys } from "./projectFinanceApi";

const deadlineDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC"
});

export function FinanceOverviewPage() {
  const query = useInfiniteQuery({
    queryKey: projectFinanceKeys.projects,
    queryFn: ({ pageParam }) => getProjectFinanceBuckets(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore
      ? lastPage.pagination.offset + lastPage.pagination.limit
      : undefined
  });
  const pages = query.data?.pages ?? [];
  const buckets = pages.flatMap((page) => page.items);
  const firstPage = pages[0];
  const summary = firstPage?.summary ?? null;

  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchNextPageError,
    query.isFetchingNextPage
  ]);

  return (
    <section className="finance-overview" aria-labelledby="finance-overview-title">
      <PageHeader
        id="finance-overview-title"
        eyebrow="Commercial control"
        title="Portfolio finance"
        description="Every client-approved estimate in one view, with GST, net revenue, the fixed 20% profit reserve, project expenses, and remaining cost budget shown separately."
        metadata={summary ? (
          <StatusBadge
            tone="info"
            label={`${summary.projectCount} client-approved ${summary.projectCount === 1 ? "project" : "projects"}`}
          />
        ) : undefined}
      />
      {query.isPending ? <PageState state="loading" message="Loading portfolio finance…" /> : null}
      {query.isError ? <PageState state="error" message="Portfolio finance could not be loaded." action={{ label: "Try again", onAction: () => void query.refetch() }} /> : null}
      {summary ? (
        <>
          <PortfolioFinanceHero summary={summary} />
          <FinanceKpis bucket={summary} />
        </>
      ) : null}
      {firstPage && buckets.length === 0 ? <PageState state="empty" message="Client-approved estimates will appear here with their project budgets." /> : null}
      {buckets.length ? (
        <Surface as="section" className="finance-projects" aria-labelledby="finance-projects-title">
          <div className="section-heading finance-projects__heading">
            <div>
              <p className="eyebrow">Project-level control</p>
              <h2 id="finance-projects-title">Client-approved project budgets</h2>
              <p>Select a project to open its complete financial details.</p>
            </div>
            <span>{query.hasNextPage ? `${buckets.length} of ${firstPage?.pagination.total ?? 0} loading` : `${buckets.length} ${buckets.length === 1 ? "project" : "projects"}`}</span>
          </div>
          <ul className="finance-projects__list" aria-label="Client-approved project budget list">
            {buckets.map((bucket) => <FinanceProjectCard bucket={bucket} key={bucket.id} />)}
          </ul>
          {query.isFetchingNextPage ? <p className="finance-projects__loading" role="status">Loading remaining approved projects…</p> : null}
          {query.isFetchNextPageError ? (
            <Button
              variant="secondary"
              className="finance-projects__load-more"
              busy={query.isFetchingNextPage}
              busyLabel="Retrying projects…"
              onClick={() => void query.fetchNextPage()}
            >
              Retry remaining projects
            </Button>
          ) : null}
        </Surface>
      ) : null}
    </section>
  );
}

function PortfolioFinanceHero({ summary }: { summary: ProjectFinancePortfolioSummary }) {
  const budgetHealthy = summary.remainingBudgetPaise >= 0;

  /*
   * The band states the position once. The gauge repeated the remaining-budget
   * figure that the last formula step already carries, and the margin note
   * repeated the reserved-profit step, so both are gone; the closing step now
   * carries the healthy/at-risk tone that the note used to signal.
   */
  return (
    <Surface as="section" className="finance-portfolio-hero" aria-labelledby="finance-portfolio-balance">
      <div className="finance-portfolio-hero__copy">
        <span className="finance-portfolio-hero__icon" aria-hidden="true"><WalletCards /></span>
        <div>
          <p className="eyebrow">Live portfolio position</p>
          <h2 id="finance-portfolio-balance">{formatPaise(summary.approvedContractTotalPaise)}</h2>
          <p>
            Client-approved value including GST across {summary.projectCount} projects. {formatPaise(summary.approvedGstPaise)} GST is excluded before budgeting.
          </p>
        </div>
        <div className="finance-portfolio-formula" aria-label="Portfolio cost budget calculation">
          <FinanceFormulaItem icon={<CircleDollarSign />} label="Net revenue after GST" value={summary.approvedSubtotalPaise} operation="=" />
          <FinanceFormulaItem icon={<ShieldCheck />} label="Reserved profit target (20%)" value={summary.targetProfitPaise} operation="−" />
          <FinanceFormulaItem icon={<ReceiptText />} label="Recorded project expenses" value={summary.recordedCostPaise} operation="−" />
          <FinanceFormulaItem
            icon={<WalletCards />}
            label={budgetHealthy ? "Remaining cost budget" : "Cost budget overrun"}
            value={Math.abs(summary.remainingBudgetPaise)}
            operation="="
            emphasized
            atRisk={!budgetHealthy}
          />
        </div>
      </div>
      <div className="finance-portfolio-alerts" aria-label="Portfolio attention items">
        <span><strong>{summary.overBudgetProjectCount}</strong> over budget</span>
        <span><strong>{summary.overdueProjectCount}</strong> live overdue</span>
        <span><strong>{summary.lateCompletedProjectCount}</strong> completed late</span>
        <span><strong>{summary.overdueTaskCount}</strong> overdue tasks</span>
      </div>
    </Surface>
  );
}

function FinanceFormulaItem({
  icon,
  label,
  value,
  operation,
  emphasized = false,
  atRisk = false
}: {
  icon: ReactNode;
  label: string;
  value: number;
  operation: "−" | "=";
  emphasized?: boolean;
  atRisk?: boolean;
}) {
  const classes = [
    "finance-portfolio-formula__item",
    emphasized && "finance-portfolio-formula__item--emphasis",
    atRisk && "finance-portfolio-formula__item--risk"
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <span className="finance-portfolio-formula__operation" aria-hidden="true">{operation}</span>
      <span className="finance-portfolio-formula__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{formatPaise(value)}</strong>
    </div>
  );
}

function FinanceProjectCard({ bucket }: { bucket: ProjectFinanceBucket }) {
  const schedule = schedulePresentation(bucket);
  const workflowStatus = bucket.status === "pending_design"
    ? { label: "Awaiting design approval", tone: "warning" as const }
    : bucket.status === "open"
      ? { label: "Finance active", tone: "success" as const }
      : { label: "Finance closed", tone: "neutral" as const };
  const showScheduleRisk = schedule.tone === "danger" || schedule.tone === "warning";
  return (
    <li className="finance-projects__item">
      <article className={`finance-project-card${bucket.overBudget ? " finance-project-card--risk" : ""}`}>
        <Link
          className="finance-project-card__link"
          to={`/finance/projects/${encodeURIComponent(bucket.projectId)}`}
          aria-label={`View ${bucket.projectName} financial details`}
        >
          <div className="finance-project-card__identity">
            <h3>{bucket.projectName}</h3>
            <div className="finance-project-card__badges">
              <StatusBadge tone={workflowStatus.tone} label={workflowStatus.label} />
              {bucket.overBudget ? <StatusBadge tone="danger" label="Over budget" /> : null}
              {showScheduleRisk ? <StatusBadge tone={schedule.tone} label={schedule.label} /> : null}
            </div>
          </div>
          <dl className="finance-project-card__summary">
            <div>
              <dt>Client-approved value</dt>
              <dd>{formatPaise(bucket.approvedContractTotalPaise)}</dd>
            </div>
            <div className={bucket.remainingBudgetPaise < 0 ? "finance-project-card__budget finance-project-card__budget--risk" : "finance-project-card__budget"}>
              <dt>{bucket.remainingBudgetPaise < 0 ? "Budget overrun" : "Remaining budget"}</dt>
              <dd>{formatPaise(Math.abs(bucket.remainingBudgetPaise))}</dd>
            </div>
          </dl>
          <div className="finance-project-card__deadline">
            <CalendarClock aria-hidden="true" />
            <span>{schedule.detail}</span>
            {bucket.overdueTaskCount > 0 ? <strong>{bucket.overdueTaskCount} overdue {bucket.overdueTaskCount === 1 ? "task" : "tasks"}</strong> : null}
          </div>
          <span className="finance-project-card__action">View financial details <ArrowUpRight aria-hidden="true" /></span>
        </Link>
      </article>
    </li>
  );
}

function schedulePresentation(bucket: ProjectFinanceBucket): { label: string; detail: string; tone: StatusTone } {
  const formatted = deadlineDate.format(new Date(bucket.deadlineAt));
  switch (bucket.deadlineStatus) {
    case "overdue":
      return { label: `${bucket.overdueDays}d overdue`, detail: `Deadline passed on ${formatted}`, tone: "danger" };
    case "completed_late":
      return { label: "Completed late", detail: `Completed after the ${formatted} deadline`, tone: "warning" };
    case "completed_on_time":
      return { label: "Completed on time", detail: `Deadline was ${formatted}`, tone: "success" };
    case "completed_date_unknown":
      return { label: "Completion date unavailable", detail: "Project is complete, but its actual completion date was not recorded", tone: "warning" };
    case "on_track":
      return { label: "On track", detail: `Deadline ${formatted}`, tone: "info" };
  }
}

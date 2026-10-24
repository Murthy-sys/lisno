import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import type { ProjectFinanceBucket, ProjectFinancePortfolioSummary } from "../../api/types";
import { DesignPaymentConfirmations } from "./DesignPaymentConfirmations";
import { formatPaise } from "./financeFormat";
import { projectBudgetDetailHref } from "./projectBudgetNavigation";
import { budgetStatusLabels, financeStageLabels, projectBudgetFiltersFromSearch, projectBudgetPageCsv, projectStatusLabels } from "./projectBudgetList";
import { getProjectBudgetPage, projectFinanceKeys, type ProjectBudgetFilters } from "./projectFinanceApi";
import "./SuperAdminProjectBudgets.css";

const compactNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const tableMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const observedDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function compactPaise(paise: number) {
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 10_000_000) return `₹${compactNumber.format(rupees / 10_000_000)} Cr`;
  if (Math.abs(rupees) >= 100_000) return `₹${compactNumber.format(rupees / 100_000)} L`;
  return formatPaise(paise);
}

export function SuperAdminProjectBudgets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const filters = projectBudgetFiltersFromSearch(searchParams);
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const [fromDate, setFromDate] = useState(filters.approvedFrom ?? "");
  const [toDate, setToDate] = useState(filters.approvedTo ?? "");
  const [dateError, setDateError] = useState("");
  const query = useQuery({
    queryKey: projectFinanceKeys.budgetProjects(filters),
    queryFn: async () => ({ page: await getProjectBudgetPage(filters), filters }),
    placeholderData: keepPreviousData
  });
  const page = query.data?.page;
  const displayingPrevious = query.isPlaceholderData;
  const displayedFilters = query.data?.filters ?? filters;
  const firstRow = page?.items.length ? page.pagination.offset + 1 : 0;
  const lastRow = page ? page.pagination.offset + page.items.length : 0;
  const activeFilters = Object.keys(filters).some((key) => key !== "limit" && key !== "offset");

  useEffect(() => { setSearchText(filters.search ?? ""); }, [filters.search]);
  useEffect(() => {
    setFromDate(filters.approvedFrom ?? "");
    setToDate(filters.approvedTo ?? "");
    setDateError("");
  }, [filters.approvedFrom, filters.approvedTo]);

  function updateFilters(changes: Record<string, string | undefined>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("offset");
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    });
  }

  function applySearch(event: FormEvent) {
    event.preventDefault();
    updateFilters({ search: searchText.trim() || undefined });
  }

  function applyDates(event: FormEvent) {
    event.preventDefault();
    if (fromDate && toDate && fromDate > toDate) {
      setDateError("The start date must be on or before the end date.");
      return;
    }
    setDateError("");
    updateFilters({ approvedFrom: fromDate, approvedTo: toDate });
  }

  function exportPage() {
    if (!page || displayingPrevious || query.isFetching || query.isError) return;
    const url = URL.createObjectURL(new Blob(["\ufeff", projectBudgetPageCsv(page, displayedFilters)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `project-budgets-page-${Math.floor(page.pagination.offset / page.pagination.limit) + 1}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <section className="project-budgets" aria-labelledby="project-budgets-title">
    <header className="project-budgets__header">
      <div className="project-budgets__heading">
        <p className="project-budgets__breadcrumb">Finance <span aria-hidden="true">/</span> Project Budgets</p>
        <h1 id="project-budgets-title">Project Budgets</h1>
        <p>Approved budgets, 20% reserved margin, and current spending in one place.</p>
      </div>
      <div className="project-budgets__scope">
        <label>Project<select value={filters.projectId ?? ""} onChange={(event) => updateFilters({ projectId: event.target.value })}>
          <option value="">All projects</option>
          {filters.projectId && !page?.filterOptions?.projects.some((project) => project.id === filters.projectId) ? <option value={filters.projectId}>Selected project</option> : null}
          {page?.filterOptions?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        <form className="project-budgets__dates" onSubmit={applyDates}>
          <fieldset><legend>Budget approved between</legend><div>
            <label><span className="sr-only">Budget approved from</span><input type="date" aria-describedby="project-budgets-date-note" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <span aria-hidden="true">to</span>
            <label><span className="sr-only">Budget approved to</span><input type="date" aria-describedby="project-budgets-date-note" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            <button type="submit">Apply dates</button>
          </div></fieldset>
        </form>
      </div>
      <p id="project-budgets-date-note" className="project-budgets__date-note">Dates select budgets by approval date (UTC). All amounts are current lifetime totals, not historical balances.</p>
      {dateError ? <p role="alert" className="project-budgets__error">{dateError}</p> : null}
    </header>

    {query.isPending ? <div className="project-budgets__state" role="status">Loading approved project budgets…</div> : null}
    {query.isError ? <div className="project-budgets__state project-budgets__error" role="alert">
      <p>{page ? "Project budgets could not be refreshed. The previously loaded amounts remain below." : "Project budgets could not be loaded."}</p>
      <button onClick={() => void query.refetch()}>Try again</button>
    </div> : null}
    {displayingPrevious ? <p className="project-budgets__notice" role="status">Updating filters. The figures and rows below still show the previous selection: {filterDescription(displayedFilters)}.</p> : query.isFetching && page ? <p className="project-budgets__notice" role="status">Refreshing the current selection…</p> : null}

    {page ? <>
      <BudgetTotals summary={page.summary} />
      <div className="project-budgets__summary-context">
        <p>{page.pagination.total} matching {page.pagination.total === 1 ? "project" : "projects"} · Budgets exclude GST · Spending includes overheads</p>
        {page.observedAt && Number.isFinite(new Date(page.observedAt).getTime()) ? <p>As of <time dateTime={page.observedAt}>{observedDate.format(new Date(page.observedAt))}</time></p> : null}
      </div>
    </> : null}

    <div className="project-budgets__workspace">
      <div className="project-budgets__toolbar">
        <form className="project-budgets__search" role="search" onSubmit={applySearch}>
          <label><span className="sr-only">Search projects</span><input type="search" placeholder="Search projects…" value={searchText} maxLength={120} onChange={(event) => setSearchText(event.target.value)} /></label>
          <button type="submit">Search</button>
        </form>
        <label>Client<select value={filters.unlinkedClient ? "__unlinked__" : filters.clientId ?? ""} onChange={(event) => updateFilters({ clientId: event.target.value === "__unlinked__" ? undefined : event.target.value, unlinkedClient: event.target.value === "__unlinked__" ? "true" : undefined })}>
          <option value="">All clients</option>
          {filters.clientId && !page?.filterOptions?.clients.some((client) => client.id === filters.clientId) ? <option value={filters.clientId}>Selected client</option> : null}
          {page?.filterOptions?.clients.map((client) => {
            const sameNames = page.filterOptions.clients.filter((entry) => entry.name === client.name);
            return <option key={client.id} value={client.id}>{client.name}{sameNames.length > 1 ? ` (${sameNames.findIndex((entry) => entry.id === client.id) + 1})` : ""}</option>;
          })}
          {page?.filterOptions?.hasUnlinkedClients || filters.unlinkedClient ? <option value="__unlinked__">Unlinked clients</option> : null}
        </select></label>
        <label>Budget status<select value={filters.budgetStatus ?? ""} onChange={(event) => updateFilters({ budgetStatus: event.target.value })} aria-describedby="project-budgets-risk-note">
          <option value="">All budget statuses</option>{Object.entries(budgetStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Finance stage<select value={filters.financeStage ?? ""} onChange={(event) => updateFilters({ financeStage: event.target.value })}>
          <option value="">All finance stages</option>{Object.entries(financeStageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <details className="project-budgets__more-filters"><summary>More filters{filters.projectStatus ? " (1)" : ""}</summary>
          <label>Project lifecycle<select value={filters.projectStatus ?? ""} onChange={(event) => updateFilters({ projectStatus: event.target.value })}>
            <option value="">All lifecycle statuses</option>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </details>
        {activeFilters ? <button className="project-budgets__clear" onClick={() => setSearchParams({})}>Clear filters</button> : null}
        <button className="project-budgets__export" onClick={exportPage} disabled={!page || displayingPrevious || query.isFetching || query.isError || page.items.length === 0}>Export current page</button>
      </div>
      <p id="project-budgets-risk-note" className="project-budgets__risk-note">At risk: at least 90% of usable budget consumed on an unfinished project. Overheads are already included in spending.</p>
      {page?.items.length ? <>
        <p id="project-budgets-scroll-note" className="project-budgets__scroll-note">Scroll horizontally to view all budget columns.</p>
        <div className="project-budgets__table-scroll" role="region" aria-label="Project budget details" aria-describedby="project-budgets-scroll-note" tabIndex={0} aria-busy={query.isFetching}>
          <table className="project-budgets__table">
            <caption className="sr-only">Current page of matching project budgets. All amounts in Indian rupees; budget excludes GST, spending includes overheads.</caption>
            <thead><tr><th scope="col">#</th><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Total budget<small>Excluding GST</small></th><th scope="col">Spending<small>Including overheads</small></th><th scope="col">Overheads</th><th scope="col">Margin (20%)<small>Reserved</small></th><th scope="col">Usable budget</th><th scope="col">Remaining</th><th scope="col">Budget status</th><th scope="col">Details</th></tr></thead>
            <tbody>{page.items.map((bucket, index) => <BudgetRow key={bucket.id} bucket={bucket} number={page.pagination.offset + index + 1} returnSearch={location.search} />)}</tbody>
          </table>
        </div>
      </> : page ? <div className="project-budgets__state" role="status"><h2>{activeFilters ? "No projects match these filters" : "No approved project budgets yet"}</h2><p>{activeFilters ? "Adjust the search or filters to see other approved budgets." : "Projects will appear here when their estimates are approved."}</p></div> : null}
      {page ? <footer className="project-budgets__pagination">
        <p>{page.items.length ? `Showing ${firstRow} to ${lastRow} of ${page.pagination.total} projects` : `Showing 0 of ${page.pagination.total} projects`}</p>
        <nav aria-label="Project budgets pagination">
          <button disabled={displayingPrevious || query.isFetching || (filters.offset ?? 0) === 0} onClick={() => updateFilters({ offset: String(Math.max(0, (filters.offset ?? 0) - 10)) })}>Previous</button>
          <span>Page {Math.floor(page.pagination.offset / page.pagination.limit) + 1}</span>
          <button disabled={displayingPrevious || query.isFetching || !page.pagination.hasMore} onClick={() => updateFilters({ offset: String((filters.offset ?? 0) + 10) })}>Next</button>
        </nav>
      </footer> : null}
    </div>
    <details className="project-budgets__payments"><summary>Initial payment confirmations</summary><DesignPaymentConfirmations /></details>
  </section>;
}

function BudgetTotals({ summary }: { summary: ProjectFinancePortfolioSummary }) {
  const totals = [
    { label: "Total Project Budget", value: summary.approvedSubtotalPaise, note: "Approved amount excluding GST", icon: "budget" },
    { label: "Total Spending", value: summary.recordedCostPaise, note: "Including all recorded overheads", icon: "spending" },
    { label: "Total Overheads", value: summary.overheadPaise, note: "Included in total spending", icon: "overheads" },
    { label: "Reserved Margin (20%)", value: summary.targetProfitPaise, note: "Reserved and not available to spend", icon: "margin" },
    { label: "Total Usable Budget", value: summary.costBudgetPaise, note: "After the 20% margin reserve", icon: "budget" }
  ];
  return <dl className="project-budgets__totals" aria-label="Matching project budget totals">
    {totals.map((total) => <div className={`project-budgets__total project-budgets__total--${total.icon}`} key={total.label}>
      <dt><span className="project-budgets__total-icon" aria-hidden="true"><BudgetIcon variant={total.icon} /></span>{total.label}</dt>
      <dd title={formatPaise(total.value)} aria-label={formatPaise(total.value)}>{compactPaise(total.value)}</dd>
      <dd className="project-budgets__total-note">{total.note}</dd>
    </div>)}
  </dl>;
}

function BudgetRow({ bucket, number, returnSearch }: { bucket: ProjectFinanceBucket; number: number; returnSearch: string }) {
  const href = projectBudgetDetailHref(bucket.projectId, returnSearch);
  const utilization = bucket.budgetUtilizationBps;
  return <tr>
    <td>{number}</td>
    <th scope="row"><Link to={href}>{bucket.projectName}</Link><small>{utilization == null ? "Utilization unavailable" : `${compactNumber.format(utilization / 100)}% of usable budget spent`}</small><small>{financeStageLabels[bucket.status]}</small></th>
    <td>{bucket.clientName ?? (bucket.clientId === null ? "Unlinked client" : "Name unavailable")}</td>
    <td>{tableMoney.format(bucket.approvedSubtotalPaise / 100)}</td><td>{tableMoney.format(bucket.recordedCostPaise / 100)}</td><td>{tableMoney.format(bucket.overheadPaise / 100)}</td><td>{tableMoney.format(bucket.targetProfitPaise / 100)}</td><td>{tableMoney.format(bucket.costBudgetPaise / 100)}</td>
    <td className={bucket.remainingBudgetPaise < 0 ? "project-budgets__negative" : undefined}>{tableMoney.format(bucket.remainingBudgetPaise / 100)}</td>
    <td>{bucket.budgetStatus ? <span className={`project-budgets__status project-budgets__status--${bucket.budgetStatus}`}>{budgetStatusLabels[bucket.budgetStatus]}</span> : <span>Not available</span>}</td>
    <td><Link className="project-budgets__details-link" to={href} aria-label={`View details for ${bucket.projectName}`}>View details</Link></td>
  </tr>;
}

function BudgetIcon({ variant }: { variant: string }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {variant === "margin" ? <><path d="M8 25 24 7" /><circle cx="9.5" cy="9" r="3.5" /><circle cx="22.5" cy="23" r="3.5" /></> : variant === "overheads" ? <><path d="M16 4v12h12A12 12 0 1 1 16 4Z" /><path d="M20 4a10 10 0 0 1 8 8h-8Z" /></> : variant === "spending" ? <><ellipse cx="16" cy="7" rx="9" ry="4" /><path d="M7 7v6c0 5 18 5 18 0V7M7 13v6c0 5 18 5 18 0v-6M7 19v6c0 5 18 5 18 0v-6" /></> : <><path d="M5 10h22v17H5zM7 10V6l16-3v7" /><path d="M20 15h7v7h-7z" /><circle cx="23" cy="18.5" r=".7" /></>}
  </svg>;
}

function filterDescription(filters: ProjectBudgetFilters) {
  const parts = [filters.search ? `search “${filters.search}”` : "all project names"];
  if (filters.projectId) parts.push("selected project");
  if (filters.clientId || filters.unlinkedClient) parts.push(filters.unlinkedClient ? "unlinked clients" : "selected client");
  if (filters.budgetStatus) parts.push(budgetStatusLabels[filters.budgetStatus]);
  if (filters.financeStage) parts.push(financeStageLabels[filters.financeStage]);
  if (filters.projectStatus) parts.push(projectStatusLabels[filters.projectStatus]);
  if (filters.approvedFrom || filters.approvedTo) parts.push(`approved ${filters.approvedFrom ?? "any start date"} to ${filters.approvedTo ?? "any end date"}`);
  return parts.join(", ");
}

import type { ReactNode } from "react";
import vendorHeader from "../../assets/vendor-directory-header.webp";
import { Button } from "../../components/ui/Button";
import type { ProcurementVendorDirectoryOverview } from "../ai-estimator-knowledge/knowledgeTypes";

export function DirectoryIcon({ name }: { name: "people" | "active" | "clock" | "chart" | "plus" | "search" | "reset" | "edit" | "view" | "archive" | "more" | "previous" | "next" }) {
  const shapes: Record<typeof name, ReactNode> = {
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3" /></>,
    active: <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
    chart: <><path d="M4 21v-6m5 6V11m5 10v-8m5 8V6M3 11l6-6 5 3 6-6m-5 0h5v5" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    reset: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></>,
    edit: <><path d="m15 4 5 5M3 21l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 16l-1 5Z" /></>,
    view: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    archive: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
    previous: <path d="m15 5-7 7 7 7" />,
    next: <path d="m9 5 7 7-7 7" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export function VendorDirectoryHeader() {
  return <header className="vendor-directory__hero">
    <img className="vendor-directory__art" src={vendorHeader} alt="" width="1600" height="538" />
    <div className="vendor-directory__intro"><p className="vendor-directory__eyebrow">Procurement</p><h1 id="vendor-procurement-title">Vendor directory</h1><p>Manage vendors, track their details, and review their performance across projects.</p></div>
    <p className="vendor-directory__quote">Reliable partners<br />for exceptional<br />spaces.</p>
  </header>;
}

export function VendorDirectoryOverview({ overview, loading, error, refreshing, retry }: {
  overview?: ProcurementVendorDirectoryOverview; loading: boolean; error: boolean; refreshing: boolean; retry: () => void;
}) {
  const available = !error && overview !== undefined;
  const value = (count: number | undefined) => loading ? "Loading…" : available ? count?.toLocaleString("en-IN") : "Not available";
  const percentage = (count: number) => `${overview?.totalVendors ? Math.round(count / overview.totalVendors * 100) : 0}%`;
  return <section className="vendor-directory__overview" aria-label="Vendor overview" aria-busy={loading || refreshing}>
    <div className="vendor-directory__metrics">
      <article className="vendor-directory__metric"><span className="vendor-directory__metric-icon"><DirectoryIcon name="people" /></span><div><h2>Total Vendors</h2><div className={`vendor-directory__value${available ? "" : " vendor-directory__value--text"}`}>{value(overview?.totalVendors)}</div><p>Current suppliers &amp; contractors</p></div></article>
      <article className="vendor-directory__metric vendor-directory__metric--active"><span className="vendor-directory__metric-icon"><DirectoryIcon name="active" /></span><div><h2>Active Vendors</h2><div className={`vendor-directory__value${available ? "" : " vendor-directory__value--text"}`}>{value(overview?.activeVendors)}{available ? <small>{percentage(overview.activeVendors)}</small> : null}</div><p>Currently available</p></div></article>
      <article className="vendor-directory__metric vendor-directory__metric--review"><span className="vendor-directory__metric-icon"><DirectoryIcon name="clock" /></span><div><h2>Under Review</h2><div className={`vendor-directory__value${available ? "" : " vendor-directory__value--text"}`}>{value(overview?.underReviewVendors)}{available ? <small>{percentage(overview.underReviewVendors)}</small> : null}</div><p>Pending address verification</p></div></article>
      <article className="vendor-directory__metric"><span className="vendor-directory__metric-icon"><DirectoryIcon name="chart" /></span><div><h2>Average KPI</h2><div className="vendor-directory__value vendor-directory__value--text">Not available</div><p>Performance is not rated yet</p></div></article>
    </div>
    {error || (!loading && !overview) ? <div className="vendor-directory__overview-error" role="status"><span>Vendor overview is unavailable.</span><Button variant="quiet" onClick={retry}>Retry overview</Button></div> : refreshing && !loading ? <span className="sr-only" role="status">Refreshing vendor overview…</span> : null}
  </section>;
}

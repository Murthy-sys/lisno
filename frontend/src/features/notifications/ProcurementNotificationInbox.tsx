import { useNavigate } from "react-router-dom";
import { formatPaise } from "../finance/financeFormat";
import { useProcurementNotifications } from "./ProcurementNotifications";
import type { ProcurementNotification } from "./procurementNotificationApi";
import "./procurementNotifications.css";

function AlertDetail({ item }: { item: ProcurementNotification }) {
  const current = item.current ?? item.snapshot;
  return <>
    <strong>{item.title}</strong><span>{item.projectName} · {item.message}</span>
    <span>{item.status === "resolved" ? "Resolved since this alert" : item.status === "stale" ? "Source changed; review current records" : current.daysOverdue > 0 ? `${current.daysOverdue} days overdue` : "Action needed"}{current.remainingPaise === null ? "" : ` · ${formatPaise(current.remainingPaise)} remaining`}</span>
    {item.responsibleName ? <span>Responsible: {item.responsibleName}</span> : null}
    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
  </>;
}
export function ProcurementNotificationInbox({ onNavigate }: { onNavigate: (path: string) => void }) {
  const notifications = useProcurementNotifications();
  if (!notifications?.enabled || notifications.denied) return null;
  const { page, offset, loading } = notifications;
  const select = async (item: ProcurementNotification) => { if (await notifications.read(item)) onNavigate(item.deepLink); };
  return <div className="procurement-alerts">
    <p>Opening an alert marks it read. Complete the payment or project action separately.</p>
    {loading ? <p role="status">Loading Procurement alerts…</p> : null}
    {!notifications.active ? <p role="status">Updates resume when this window is active and online.</p> : null}
    {notifications.error ? <p role="alert">Alerts may be out of date. <button type="button" onClick={notifications.refresh}>Try again</button></p> : null}
    {notifications.readError ? <p role="alert">{notifications.readError}</p> : null}
    {page?.health.status !== "healthy" && page ? <p role="status">Reminder service: {page.health.status.replaceAll("_", " ")}. Check project due dates directly while reminders recover.</p> : null}
    {page && !page.items.length ? <p>No Procurement alerts on this page.</p> : null}
    <ul className="procurement-alerts__list">{page?.items.map(item => <li key={item.id}><button type="button" disabled={notifications.reading !== null} onClick={() => void select(item)} aria-label={`${item.title}${item.readAt ? "" : ", unread"}. Open project`}><AlertDetail item={item} /></button></li>)}</ul>
    {page && (offset > 0 || offset + page.items.length < page.total) ? <nav aria-label="Procurement alert pages"><button type="button" disabled={offset === 0 || loading} onClick={() => notifications.setOffset(Math.max(0, offset - 20))}>Newer</button><span>Page {Math.floor(offset / 20) + 1}</span><button type="button" disabled={offset + page.items.length >= page.total || loading} onClick={() => notifications.setOffset(offset + 20)}>Older</button></nav> : null}
  </div>;
}
export function ProcurementAttention() {
  const notifications = useProcurementNotifications(); const navigate = useNavigate();
  if (!notifications?.enabled || notifications.denied) return null;
  const recent = notifications.recent;
  const active = recent?.items.filter(item => item.status !== "resolved") ?? [];
  return <section className="procurement-alerts procurement-alerts--attention" aria-label="Procurement attention">
    <header><h2>Procurement attention</h2><button type="button" onClick={notifications.refresh}>Refresh alerts</button></header>
    {notifications.loading ? <p role="status">Checking due payments and project reviews…</p> : notifications.error ? <p role="alert">Alerts could not be refreshed. Open project tabs to check current due dates.</p> : <p>{recent?.unreadCount ?? 0} unread alerts. Recent outstanding actions appear below; the notification inbox contains the full history.</p>}
    {recent && recent.health.status !== "healthy" ? <p role="status">Reminder service: {recent.health.status.replaceAll("_", " ")}. Latest completed sweep: {recent.health.lastSweepAt ? new Date(recent.health.lastSweepAt).toLocaleString() : "not yet recorded"}.</p> : null}
    <ul className="procurement-alerts__list">{active.slice(0, 5).map(item => <li key={item.id}><button type="button" disabled={notifications.reading !== null} onClick={() => void notifications.read(item).then(ok => { if (ok) navigate(item.deepLink); })}><AlertDetail item={item} /></button></li>)}</ul>
  </section>;
}

import { Bell, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Drawer } from "../../components/ui/Drawer";
import { IconButton } from "../../components/ui/IconButton";
import { useNotifications } from "./NotificationProvider";
import { notificationApi, notificationKeys, notificationPath, notificationTitle, type ProjectNotification } from "./notificationApi";

const timestamp = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function NotificationBell() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const older = useQuery({
    queryKey: notificationKeys.page(notifications?.scope ?? "inactive", offset),
    queryFn: ({ signal }) => notificationApi.list(offset, signal),
    enabled: Boolean(notifications?.active && open && offset > 0),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  if (!notifications) return null;
  const page = offset ? older.data : notifications.page;
  const pending = offset ? older.isFetching && !page : notifications.loading;
  const error = offset ? older.isError : notifications.error;
  const unread = notifications.page?.unreadCount ?? 0;
  const available = notifications.enabled && !notifications.denied;
  const select = async (item: ProjectNotification) => {
    if (await notifications.read(item)) {
      setOpen(false);
      navigate(notificationPath(item));
    }
  };

  return <>
    <IconButton ref={trigger} className="notification-bell" variant="quiet"
      label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "notification-inbox" : undefined}
      icon={<><Bell size={21} aria-hidden="true" />{unread > 0 ? <span className="notification-bell__count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}</>}
      onClick={() => { setOffset(0); setOpen(true); }} />
    <Drawer id="notification-inbox" open={open} title="Notifications" variant="contextual" width="narrow"
      description="Project mentions and updates" onClose={() => setOpen(false)} returnFocusRef={trigger} className="notification-inbox">
      {!available ? <p role="status" className="notification-state">Notifications are unavailable for your current access.</p> : <>
        {pending ? <p role="status" className="notification-state">Loading notifications…</p> : null}
        {!notifications.active ? <p role="status" className="notification-state">You’re offline. Updates will resume when you reconnect.</p> :
          notifications.connection === "reconnecting" ? <p role="status" className="notification-state">Reconnecting to live updates…</p> : null}
        {error ? <div role="alert" className="notification-state notification-state--error">{page ? "Notifications may be out of date. " : "Notifications could not be loaded. "}
          <button type="button" onClick={() => offset ? void older.refetch() : notifications.retry()}>Try again</button></div> : null}
        {notifications.readError ? <p role="alert" className="notification-state notification-state--error">{notifications.readError}</p> : null}
        {page && !page.items.length ? <div className="notification-empty"><Bell size={30} aria-hidden="true" /><p>{offset ? "No older notifications" : "You’re all caught up"}</p><span>{offset ? "Go back to see your recent notifications." : "When someone mentions you in a project chat, it will appear here."}</span></div> : null}
        <ul className="notification-list">
          {page?.items.map(item => <li key={item.id}>
            <button type="button" className={`notification-item${item.readAt ? "" : " notification-item--unread"}`}
              aria-label={`${notificationTitle(item)}${item.readAt ? "" : ", unread"}. Open message`}
              disabled={notifications.reading.has(item.id)} aria-busy={notifications.reading.has(item.id) || undefined}
              onClick={() => void select(item)}>
              <span className="notification-item__indicator" aria-hidden="true">{item.readAt ? <Check size={15} /> : "@"}</span>
              <span className="notification-item__body"><strong>{notificationTitle(item)}</strong><span className="notification-item__excerpt">{item.excerpt}</span><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time></span>
            </button>
          </li>)}
        </ul>
        {page && (offset > 0 || page.pagination.hasMore) ? <nav className="notification-pagination" aria-label="Notification pages">
          <button type="button" disabled={offset === 0 || pending} onClick={() => setOffset(value => Math.max(0, value - 20))}><ChevronLeft size={16} aria-hidden="true" />Newer</button>
          <span>Page {Math.floor(offset / 20) + 1}</span>
          <button type="button" disabled={!page.pagination.hasMore || pending} onClick={() => setOffset(value => value + 20)}>Older<ChevronRight size={16} aria-hidden="true" /></button>
        </nav> : null}
      </>}
    </Drawer>
  </>;
}

export function NotificationBanners() {
  const notifications = useNotifications();
  const navigate = useNavigate();
  const [attempted, setAttempted] = useState(false);
  const error = attempted ? notifications?.readError : null;
  if (!notifications || (!notifications.banners.length && !error)) return null;
  const select = async (item: ProjectNotification) => {
    setAttempted(true);
    if (await notifications.read(item)) { setAttempted(false); navigate(notificationPath(item)); }
  };
  return <section className="notification-banners" aria-label="New notifications" aria-live="polite" aria-relevant="additions">
    {notifications.banners.map(item => <div className="notification-banner" key={item.id}>
      <button type="button" className="notification-banner__open" disabled={notifications.reading.has(item.id)} onClick={() => void select(item)}>
        <span className="notification-banner__icon" aria-hidden="true">@</span>
        <span><strong>{notificationTitle(item)}</strong><span>{item.excerpt}</span><small>Open message</small></span>
      </button>
      <IconButton label={`Dismiss notification from ${item.actor.name}`} variant="quiet" icon={<X size={18} aria-hidden="true" />} onClick={() => notifications.dismiss(item.id)} />
    </div>)}
    {error ? <div className="notification-banner"><p role="alert" className="notification-state notification-state--error">{error}</p><IconButton label="Dismiss notification error" variant="quiet" icon={<X size={18} aria-hidden="true" />} onClick={() => setAttempted(false)} /></div> : null}
  </section>;
}

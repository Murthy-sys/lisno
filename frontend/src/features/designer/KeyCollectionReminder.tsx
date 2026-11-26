import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { projectReadDenied } from "../projects/projectReadQueries";
import { KeyCollectionTimer } from "../workflow/KeyCollectionTimer";
import { keyCollectionDate } from "../workflow/keyCollectionClock";
import { getKeyCollectionReminders, keyCollectionReminderKeys, keyCollectionReminderPageSize, type ReceivedCollectionReminders } from "./keyCollectionRemindersApi";

export function KeyCollectionReminder({ fallbackFocusRef }: { fallbackFocusRef?: RefObject<HTMLElement | null> }) {
  const { user, authorization, reviewSession } = useAuth();
  if (!user || user.role !== "designer" || !hasFrontendPermission(authorization, "design.key_collection_reminders.read")) return null;
  const actor = `${user.id}:${user.role}:${reviewSession?.id ?? ""}`;
  return <ReminderControl key={actor} actor={actor} fallbackFocusRef={fallbackFocusRef} />;
}

function ReminderControl({ actor, fallbackFocusRef }: { actor: string; fallbackFocusRef?: RefObject<HTMLElement | null> }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery<ReceivedCollectionReminders | null>({
    queryKey: keyCollectionReminderKeys.page(actor, offset),
    queryFn: async ({ signal }) => {
      try { return await getKeyCollectionReminders(offset, signal); }
      catch (error) {
        if (projectReadDenied(error)) queryClient.setQueriesData<ReceivedCollectionReminders | null>({ queryKey: [...keyCollectionReminderKeys.all, actor] }, null);
        throw error;
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: (attempt, error) => !projectReadDenied(error) && attempt < 1
  });
  const denied = projectReadDenied(query.error);
  const data = denied ? undefined : query.data;
  useEffect(() => { if (denied) setOpen(false); }, [denied]);
  useEffect(() => {
    if (!data || query.isFetching) return;
    if (offset > 0 && offset >= data.pagination.total) setOffset(Math.max(0, Math.ceil(data.pagination.total / keyCollectionReminderPageSize) - 1) * keyCollectionReminderPageSize);
  }, [data, offset, query.isFetching]);
  useEffect(() => {
    if (!data?.nextRedAt || query.isError) return;
    const serverNow = Date.parse(data.serverNow) + Math.max(0, Date.now() - data.receivedAt);
    const delay = Math.min(2_147_483_647, Math.max(250, Date.parse(data.nextRedAt) - serverNow));
    const timer = window.setTimeout(() => void query.refetch(), delay);
    return () => window.clearTimeout(timer);
  }, [data, query.isError, query.refetch]);
  if (denied) return null;
  const show = query.isError || Boolean(data?.urgentCount);
  return <>
    {show ? <button type="button" ref={trigger} className="key-collection-reminder" data-state={data?.urgentCount ? "red" : "unavailable"}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); void query.refetch(); }}>
      {data?.urgentCount ? `Key collection needs attention (${data.urgentCount})` : "Key collection reminders · Retry"}
      {query.isError && data?.urgentCount ? " · May be out of date" : ""}
    </button> : null}
    {open ? <Dialog title="Key collection reminders" eyebrow="Your projects" description="Complete the required kickoff steps and record key collection for these projects."
      onClose={() => setOpen(false)} returnFocusRef={trigger} fallbackFocusRef={fallbackFocusRef} className="key-collection-dialog">
      <div className="key-collection-details">
        {query.isPending ? <p role="status">Loading key-collection reminders…</p> : null}
        {query.isPlaceholderData ? <p role="status">Loading reminders… Showing the previous page.</p> : null}
        {query.isError ? <p role="alert">{data ? "These reminders may be out of date. " : "Reminders could not be loaded. "}Refresh to try again.</p> : null}
        <div className="key-collection-actions"><Button variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh reminders</Button></div>
        {data?.items.length === 0 ? <p>No pending key collections in the red zone.</p> : null}
        <ul className="key-collection-reminders">{data?.items.map(item => <li key={`${item.projectId}:${item.appointment.timing?.appointmentId}`}>
          <h3>{item.projectName}</h3>
          <KeyCollectionTimer appointment={item.appointment} serverNow={data.serverNow} receivedAt={data.receivedAt} />
          <p>By <time dateTime={item.appointment.deadlineAt}>{keyCollectionDate(item.appointment.deadlineAt)}</time> (Asia/Kolkata)</p>
          {item.blockers.length ? <ul>{item.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul> : null}
          <Link to={`/designer/projects/${encodeURIComponent(item.projectId)}#key-collection`} state={{ keyCollectionOpen: Date.now() }} onClick={() => setOpen(false)} aria-label={`Open key collection for ${item.projectName}`}>Open key collection</Link>
        </li>)}</ul>
        {data && (offset > 0 || data.pagination.hasMore) ? <nav className="key-collection-actions" aria-label="Key collection reminder pages">
          <Button variant="secondary" disabled={!offset || query.isFetching} onClick={() => setOffset(Math.max(0, offset - keyCollectionReminderPageSize))}>Previous reminders</Button>
          <Button variant="secondary" disabled={!data.pagination.hasMore || query.isFetching} onClick={() => setOffset(offset + keyCollectionReminderPageSize)}>Next reminders</Button>
        </nav> : null}
      </div>
    </Dialog> : null}
  </>;
}

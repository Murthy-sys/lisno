import type { KeyCollectionAppointmentView } from "../../../../shared/projects/designerAssignment";
import { collectionCountdown, collectionZone, useServerAdjustedClock } from "./keyCollectionClock";
import "./keyCollection.css";

export function KeyCollectionTimer({ appointment, serverNow, receivedAt, compact = false }: {
  appointment: KeyCollectionAppointmentView; serverNow: string; receivedAt?: number; compact?: boolean;
}) {
  const now = useServerAdjustedClock(serverNow, receivedAt);
  const zone = collectionZone(appointment, now);
  const className = `key-collection-clock${compact ? " key-collection-clock--chip" : ""}`;
  if (!zone) return <span className={className} data-zone="unavailable">Key collection · Timing unavailable</span>;
  const deadline = Date.parse(appointment.deadlineAt);
  const label = now > deadline ? "Overdue" : now === deadline ? "Due now" : zone === "red" ? "Urgent" : zone === "orange" ? "Attention" : "On track";
  const countdown = collectionCountdown(deadline, now);
  return <span className={className} data-zone={zone}>
    <span className="key-collection-clock__label">Key collection · {label}</span>
    <time role="timer" aria-live="off" aria-label={now > deadline ? "Key collection overdue" : now === deadline ? "Key collection due now" : "Time until key collection"} dateTime={appointment.deadlineAt}>
      {compact ? countdown.replace(/ remaining$/, "") : countdown}
    </time>
  </span>;
}

import { useEffect, useMemo, useState } from "react";
import type { KeyCollectionAppointmentView } from "../../../../shared/projects/designerAssignment";

export function useServerAdjustedClock(serverNow: string | undefined, receivedAt?: number) {
  const anchor = useMemo(() => ({ server: serverNow ? Date.parse(serverNow) : NaN, receipt: receivedAt ?? Date.now() }), [serverNow, receivedAt]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    if (!Number.isFinite(anchor.server)) return;
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [anchor]);
  return anchor.server + Math.max(0, now - anchor.receipt);
}

export function collectionCountdown(deadline: number, now: number) {
  const remaining = deadline - now;
  const seconds = Math.max(0, Math.ceil(Math.abs(remaining) / 1000));
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
  return remaining < 0 ? `Overdue by ${clock}` : remaining === 0 ? "00:00:00 · Due now" : `${clock} remaining`;
}

export function collectionZone(appointment: KeyCollectionAppointmentView, now: number) {
  const orange = Date.parse(appointment.timing?.orangeAt ?? "");
  const red = Date.parse(appointment.timing?.redAt ?? "");
  const deadline = Date.parse(appointment.deadlineAt);
  const start = Date.parse(appointment.confirmedAt);
  if (!appointment.timing?.appointmentId || ![start, orange, red, deadline, now].every(Number.isFinite) ||
    !(start < orange && orange < red && red < deadline)) return null;
  return now >= red ? "red" : now >= orange ? "orange" : "green";
}

export const keyCollectionDate = (value: string) => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value))
  : "Unavailable";

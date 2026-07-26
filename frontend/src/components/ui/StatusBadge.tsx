export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function StatusBadge({
  label,
  reason,
  tone = "neutral"
}: {
  label: string;
  reason?: string;
  tone?: StatusTone;
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      <span>{label}</span>
      {reason ? <span className="sr-only">: {reason}</span> : null}
    </span>
  );
}

import { CheckCircle2, Circle, CircleX, Info, TriangleAlert } from "lucide-react";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

const icons = {
  neutral: Circle,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info
} as const;

export function StatusBadge({
  label,
  reason,
  tone = "neutral"
}: {
  label: string;
  reason?: string;
  tone?: StatusTone;
}) {
  const Icon = icons[tone];

  return (
    <span className={`ui-status ui-status--${tone}`}>
      <Icon aria-hidden="true" />
      {label}
      {reason ? <span className="sr-only">: {reason}</span> : null}
    </span>
  );
}

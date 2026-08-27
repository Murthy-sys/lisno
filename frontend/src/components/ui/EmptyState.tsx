import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false
}: EmptyStateProps) {
  return (
    <section className={`ui-empty-state${compact ? " ui-empty-state--compact" : ""}`}>
      <div className="ui-empty-state__icon" aria-hidden="true">
        {icon ?? <Inbox />}
      </div>
      <h2 className="ui-empty-state__title">{title}</h2>
      <p className="ui-empty-state__description">{description}</p>
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </section>
  );
}

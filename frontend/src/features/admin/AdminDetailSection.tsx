import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function AdminDetailSection({
  icon,
  tone,
  title,
  subtitle,
  id,
  defaultOpen = false,
  children
}: {
  icon: ReactNode;
  tone: "warm" | "cool";
  title: string;
  subtitle: string;
  id?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const subtitleId = useId();

  return (
    <div
      className={`admin-project-detail__section admin-project-detail__section--${tone}${open ? " admin-project-detail__section--open" : ""}`}
      role="region"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">{title}</h2>
      <button
        type="button"
        id={id}
        className="admin-project-detail__section-trigger"
        aria-expanded={open}
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="admin-project-detail__section-icon" aria-hidden="true">{icon}</span>
        <span className="admin-project-detail__section-copy">
          <span className="admin-project-detail__section-title" aria-hidden="true">{title}</span>
          <span id={subtitleId} className="admin-project-detail__section-subtitle">{subtitle}</span>
        </span>
        <ChevronDown className="admin-project-detail__section-chevron" aria-hidden="true" />
      </button>
      <div className="admin-project-detail__section-body">{children}</div>
    </div>
  );
}

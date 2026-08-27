import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert
} from "lucide-react";
import type { ReactNode } from "react";

export type FeedbackTone = "info" | "success" | "warning" | "error";

export interface InlineMessageProps {
  tone: FeedbackTone;
  label?: string;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
}

const toneIcons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert
} satisfies Record<FeedbackTone, typeof Info>;

export function InlineMessage({
  tone,
  label,
  title,
  children,
  action,
  role
}: InlineMessageProps) {
  const Icon = toneIcons[tone];
  const messageRole = role ?? (tone === "error" ? "alert" : undefined);

  return (
    <div
      className={`ui-inline-message ui-inline-message--${tone}`}
      role={messageRole}
      aria-label={label}
    >
      <Icon className="ui-inline-message__icon" aria-hidden="true" />
      <div className="ui-inline-message__copy">
        {title ? <strong className="ui-inline-message__title">{title}</strong> : null}
        <div className="ui-inline-message__body">{children}</div>
      </div>
      {action ? <div className="ui-inline-message__action">{action}</div> : null}
    </div>
  );
}

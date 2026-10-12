import type { ReactNode } from "react";

import "./dialog.css";

/** Visual context only; the popup keeps its existing accessible title. */
export function DialogToolbar({ title, children, className }: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return <div className={["ui-dialog-toolbar", className].filter(Boolean).join(" ")}>
    <div className="ui-dialog-toolbar__identity" aria-hidden="true">
      <span className="ui-dialog-toolbar__brand"><img src="/lisno-chat-mark.svg" width="24" height="24" alt="" />LISNO</span>
      <span className="ui-dialog-toolbar__context">{title}</span>
    </div>
    {children}
  </div>;
}

import type { MouseEvent, ReactNode } from "react";

export function SkipLink({
  targetId = "main-content",
  children = "Skip to main content"
}: {
  targetId?: string;
  children?: ReactNode;
}) {
  const focusTarget = (_event: MouseEvent<HTMLAnchorElement>) => {
    document.getElementById(targetId)?.focus();
  };

  return (
    <a className="ui-skip-link" href={`#${targetId}`} onClick={focusTarget}>
      {children}
    </a>
  );
}

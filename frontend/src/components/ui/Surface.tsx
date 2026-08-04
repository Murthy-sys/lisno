import { createElement, forwardRef, type HTMLAttributes } from "react";

export type SurfaceVariant = "default" | "subtle" | "raised" | "interactive";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  variant?: SurfaceVariant;
  padding?: "compact" | "default" | "spacious";
}

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  {
    as = "div",
    variant = "default",
    padding = "default",
    className,
    ...rest
  },
  ref
) {
  const classes = [
    "ui-surface",
    `ui-surface--${variant}`,
    `ui-surface--padding-${padding}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return createElement(as, { ...rest, className: classes, ref });
});

import { useEffect, useRef, useState, type ReactNode } from "react";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
  progress
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  /** Optional colour category; omit for the plain, untoned card every other consumer gets. */
  tone?: "neutral" | "active" | "hold" | "done" | "overdue" | "risk";
  /** 0-1 share, rendered as a thin fill bar under the value when given. */
  progress?: number;
}) {
  const cardRef = useRef<HTMLElement>(null);
  /*
   * The fill grows in once the card first scrolls into view, rather than on
   * mount, matching the trend charts further down this same dashboard.
   * IntersectionObserver is absent in jsdom, so tests (and any engine
   * without it) fall back to already-visible.
   */
  const [inView, setInView] = useState(progress === undefined || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (inView) return;
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article ref={cardRef} className={`metric-card${tone ? ` metric-card--${tone}` : ""}`}>
      <div className="metric-card__top">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <p>{label}</p>
      </div>
      <strong className="metric-card__value">{value}</strong>
      {detail ? <p className="metric-card__detail">{detail}</p> : null}
      {progress !== undefined ? (
        <span className="metric-card__progress" aria-hidden="true">
          <span style={{ inlineSize: `${inView ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0}%` }} />
        </span>
      ) : null}
    </article>
  );
}

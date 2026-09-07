import { useEffect, useRef, useState } from "react";

/*
 * Charts render at true pixel scale rather than being stretched through a
 * viewBox, so axis text keeps the same size as the rest of the interface at
 * every container width. ResizeObserver is absent in jsdom and in older
 * engines; the fallback width keeps the server- and test-rendered chart
 * identical to the first painted frame.
 */
export function useChartWidth<T extends HTMLElement = HTMLDivElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(Math.round(measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width } as const;
}

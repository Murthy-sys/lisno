import type { SVGProps } from "react";

const paths = {
  back: "M14 5l-7 7 7 7M7 12h14",
  next: "m9 5 7 7-7 7",
  previous: "m15 5-7 7 7 7",
  down: "m6 9 6 6 6-6",
  close: "m6 6 12 12M6 18 18 6",
  search: "M20 20l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  refresh: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
  people: "M16 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM18 4a4 4 0 0 1 0 7M19 15a4 4 0 0 1 3 4v2",
  message: "M20 4H4v13h5l4 4v-4h7V4ZM7 8h10M7 12h6",
  details: "M4 3h16v18H4V3ZM14 3v18M7 7h4M7 11h4",
  attach: "m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9M6 14l8-8",
  file: "M5 3h9l5 5v13H5V3ZM14 3v6h5M8 13h8M8 17h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5",
  send: "m3 3 18 9-18 9 4-9-4-9ZM7 12h14",
  flag: "M5 22V3h13l-3 4 3 4H5",
  smile: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8 9h.01M16 9h.01M7 14c2 4 8 4 10 0",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  stop: "M6 6h12v12H6V6Z",
  play: "m7 4 13 8-13 8V4Z",
  pause: "M8 4v16M16 4v16",
  check: "m4 12 5 5L20 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l4 2",
  external: "M14 3h7v7M21 3 11 13M10 4H4v16h16v-6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7h.01",
} as const;

export type ChatIconName = keyof typeof paths;
export function ChatIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: ChatIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>;
}

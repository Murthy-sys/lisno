import type { ReactNode } from "react";

const drawings = {
  home: <><path d="m3.5 10 8.5-7 8.5 7v10H15v-6H9v6H3.5Z" /><path d="M9 20h6" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="14" y="3.5" width="6.5" height="4.5" rx="1" /><rect x="14" y="11.5" width="6.5" height="9" rx="1" /><rect x="3.5" y="14" width="7" height="6.5" rx="1" /></>,
  projects: <><path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 3h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V7Z" /><path d="M3 9h18M8 13v3m4-3v5m4-5v2" /></>,
  people: <><circle cx="9" cy="7" r="3" /><path d="M3.5 20v-3A4.5 4.5 0 0 1 8 12.5h2a4.5 4.5 0 0 1 4.5 4.5v3M16 4.5a3 3 0 0 1 0 6M17 13a4.5 4.5 0 0 1 3.5 4.5V20" /></>,
  organization: <><path d="M4 21V4l10-2v19M14 8h6v13M2 21h20M8 6h2m-2 4h2m-2 4h2m7-2h1m-1 4h1M8 21v-3h2v3" /></>,
  estimates: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h3m3 0h2m-8 4h3m3 0h2m-8 3h3" /></>,
  design: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4l-.4-.4a1.6 1.6 0 0 1 1.2-2.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z" /><circle cx="7" cy="10" r=".8" /><circle cx="10" cy="6.5" r=".8" /><circle cx="15" cy="7" r=".8" /><circle cx="6.5" cy="15" r=".8" /></>,
  procurement: <><path d="M3 4h2l2.5 11h11L21 7H6M8 11h11.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></>,
  configuration: <><path d="M4 7h16M4 17h16" /><rect x="8" y="4" width="4" height="6" rx="1" /><rect x="14" y="14" width="4" height="6" rx="1" /></>,
  responses: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6m-12 9 2 2 4-4" /></>,
  access: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 12l2 2 4-4M9 18h6" /></>,
  finance: <><path d="M19 7V4H6a3 3 0 0 0-3 3v11a2 2 0 0 0 2 2h16V7H6a1.5 1.5 0 0 1 0-3M21 11h-6v5h6" /><circle cx="17" cy="13.5" r=".5" /></>,
  key: <><circle cx="8" cy="8" r="4.5" /><path d="m11.5 11.5 9 9m-5-5 3-3m-6 0 3-3" /><circle cx="6.5" cy="6.5" r=".5" /></>,
  messages: <><path d="M3 4h15v11H9l-5 4v-4H3ZM8 19h7l5 3v-4h1V9" /><path d="M7 8h7m-7 3h5" /></>
} satisfies Record<string, ReactNode>;

const destinationIcons: Readonly<Record<string, keyof typeof drawings>> = {
  "/project-messages": "messages",
  "/designer": "dashboard",
  "/designer/design-plans": "design",
  "/manager": "people",
  "/head": "organization",
  "/estimator-sales": "estimates",
  "/client": "projects",
  "/admin/dashboard": "dashboard",
  "/admin/projects": "projects",
  "/admin/users": "people",
  "/admin/configuration/estimation": "configuration",
  "/admin/procurement": "procurement",
  "/procurement": "procurement",
  "/admin/client-responses": "responses",
  "/admin/design-approvals": "design",
  "/admin/access-requests": "access",
  "/finance": "finance",
  "/access-requests/mine": "key",
  "/home": "home"
};

export function SidebarIcon({ destination }: { destination: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {drawings[destinationIcons[destination] ?? "home"]}
    </svg>
  );
}

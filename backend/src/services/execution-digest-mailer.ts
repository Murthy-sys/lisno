export interface ExecutionDigestMail {
  notificationId: string;
  recipient: { name: string; email: string };
  projectId: string;
  projectName: string;
  kind: "daily_reminder" | "daily_escalation" | "access_blocked" | "verification_pending";
  localDate: string;
  timezone: string;
  vendor: boolean;
  items: { assignmentId: string; itemName: string; orderNumber: string; status: string; progress: number; dueAt: string | null; reasons: string[] }[];
  overflowCount: number;
}
export type ExecutionDigestMailer = { readonly deliveryKind: "disabled" } | { readonly deliveryKind: "external" | "local_test"; sendDigest(input: ExecutionDigestMail): Promise<void> };
const escape = (s: string) => s.replace(/[&<>"']/gu, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
export function executionDigestTemplate(input: ExecutionDigestMail, publicFrontendUrl: string) {
  const url = new URL(input.vendor ? "/vendor" : `/projects/${encodeURIComponent(input.projectId)}/execution`, publicFrontendUrl).toString();
  const heading = input.kind === "daily_reminder" ? "Daily work update due" : "Project work needs attention";
  const lines = input.items.map(item => `${item.itemName} (${item.orderNumber}): ${item.status}, ${item.progress}% reported${item.dueAt ? `, due ${new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.dueAt))} ${input.timezone}` : ""}. ${item.reasons.join(", ")}`);
  const extra = input.overflowCount ? `${input.overflowCount} additional assignments are available in the tracker.` : "";
  return { subject: `${heading}: ${input.projectName}`.replace(/[\r\n]/gu, " ").slice(0, 180), text: `${heading}\n${input.projectName} · ${input.localDate}\n\n${lines.join("\n")}\n${extra}\nOpen the authenticated tracker: ${url}\n`, html: `<h1>${escape(heading)}</h1><p>${escape(input.projectName)} · ${escape(input.localDate)}</p><ul>${lines.map(line => `<li>${escape(line)}</li>`).join("")}</ul>${extra ? `<p>${escape(extra)}</p>` : ""}<p><a href="${escape(url)}">Open work tracker</a></p>` };
}

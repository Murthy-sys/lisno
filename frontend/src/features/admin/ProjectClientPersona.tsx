import { useId, type ReactNode } from "react";

import {
  isProjectCalendarDate,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_LANGUAGE_OPTIONS
} from "../../../../shared/projects/projectInitiation";
import type { AdminProjectSummary } from "../../api/types";

const missing = "Not captured";
const calendarDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
});

function captured(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value : missing;
}

function languageLabel(value: string | null | undefined) {
  return PROJECT_LANGUAGE_OPTIONS.find(option => option.value === value)?.label ?? missing;
}

function closureDate(value: string | null | undefined): ReactNode {
  if (typeof value !== "string" || !isProjectCalendarDate(value)) return missing;
  return <time dateTime={value}>{calendarDate.format(new Date(`${value}T00:00:00.000Z`))}</time>;
}

export function ProjectClientPersona({ project }: { project: AdminProjectSummary }) {
  const headingId = useId();
  const languages = Array.isArray(project.languagesKnown) && project.languagesKnown.length
    ? project.languagesKnown.map(languageLabel).join(", ") : missing;
  const fields: Array<[string, ReactNode]> = [
    ["Client name", captured(project.client.name)],
    ["Email", captured(project.client.email)],
    ["Mobile", captured(project.client.mobile)],
    ["Native place", captured(project.nativePlace)],
    ["Preferred language", languageLabel(project.preferredLanguage)],
    ["Languages known", languages],
    ["Purpose", PROJECT_CATEGORY_OPTIONS.find(option => option.value === project.category)?.label ?? missing],
    ["Tentative budget", captured(project.tentativeBudget)],
    ["Tentative closure date", closureDate(project.closureTentativeDate)]
  ];

  return <section className="admin-project-simple__section" aria-labelledby={headingId}>
    <h2 id={headingId}>Client persona</h2>
    <dl className="admin-project-simple__facts">
      {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}

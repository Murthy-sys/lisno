import { useState } from "react";
import { Link } from "react-router-dom";

import type { ProcurementProject } from "../../api/types";
import { formatPaise } from "../finance/ProjectFinancePanel";
import {
  procurementProjectActualTotal,
  procurementProjectEstimatedTotal,
  procurementProjectPath,
  purchaseDate
} from "./procurementPresentation";
import { resolveProcurementProjectImage } from "./procurementProjectImages";

interface ProcurementProjectCardProps {
  project: ProcurementProject;
  eagerImage: boolean;
}

export function ProcurementProjectCard({ project, eagerImage }: ProcurementProjectCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const estimatedTotal = procurementProjectEstimatedTotal(project);
  const actualTotal = procurementProjectActualTotal(project);
  const values = [estimatedTotal, actualTotal, estimatedTotal - actualTotal].map(formatPaise);
  const itemCount = project.sections.reduce((total, section) => total + section.items.length, 0);
  const openedDate = typeof project.openedAt === "string" && project.openedAt.trim() ? new Date(project.openedAt) : null;
  const openedLabel = openedDate && Number.isFinite(openedDate.getTime()) ? purchaseDate.format(openedDate) : null;
  const clientName = typeof project.clientName === "string" ? project.clientName.trim() : "";

  return (
    <article className="procurement-gallery-card" aria-label={project.projectName}>
      <Link className="procurement-gallery-card__link" to={procurementProjectPath(project.projectId)} aria-label={`View procurement items for ${project.projectName}`}>
        <div className="procurement-gallery-card__cover">
          {imageFailed ? (
            <div className="procurement-gallery-card__cover-placeholder" aria-hidden="true"><svg viewBox="0 0 64 40"><path d="M5 35V17L23 5l18 12v18M14 35V22h18v13M41 35V14l18 11v10M3 35h58" /></svg></div>
          ) : (
            <img src={resolveProcurementProjectImage(project.projectId)} alt="" width="960" height="400" loading={eagerImage ? "eager" : "lazy"} decoding="async" onError={() => setImageFailed(true)} />
          )}
          <span className="procurement-gallery-card__approval">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" /><path d="m6 10 2.5 2.5L14 7" /></svg>
            Design approved
          </span>
          <span className="procurement-gallery-card__count" aria-label={`${itemCount} selected ${itemCount === 1 ? "item" : "items"}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
            {itemCount} <span className="sr-only">selected {itemCount === 1 ? "item" : "items"}</span>
          </span>
        </div>
        <div className="procurement-gallery-card__body">
          <div className="procurement-gallery-card__identity">
            <p className="procurement-gallery-card__version">Estimate v{project.estimateVersion}</p>
            <h3>{project.projectName}</h3>
            <div className="procurement-gallery-card__details">
              {openedLabel ? <span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="1" /><path d="M8 2v6M16 2v6M4 10h16" /></svg>
                <time dateTime={project.openedAt} aria-label={`Procurement opened ${openedLabel}`}>{openedLabel}</time>
              </span> : null}
              {clientName ? <span aria-label={`Client: ${clientName}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>
                {clientName}
              </span> : null}
            </div>
            <p className="procurement-gallery-card__sections">{project.sections.length} selected Estimate {project.sections.length === 1 ? "section" : "sections"}</p>
          </div>
          <dl className="procurement-gallery-card__totals" aria-label={`${project.projectName} procurement totals`}>
            <div><dt><span aria-hidden="true">Selected</span><span className="sr-only">Selected estimate value</span></dt><dd>{values[0]}</dd></div>
            <div><dt><span aria-hidden="true">Spent</span><span className="sr-only">Recorded spend</span></dt><dd>{values[1]}</dd></div>
            <div><dt><span aria-hidden="true">Remaining</span><span className="sr-only">Remaining selected value</span></dt><dd>{values[2]}</dd></div>
          </dl>
          <span className="procurement-gallery-card__action">View project <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" /></svg></span>
        </div>
      </Link>
    </article>
  );
}

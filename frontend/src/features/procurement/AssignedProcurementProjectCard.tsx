import { useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../../api/types";
import { procurementProjectPath } from "./procurementPresentation";
import { resolveProcurementProjectImage } from "./procurementProjectImages";

export function AssignedProcurementProjectCard({ project, preparationKnown }: { project: Project; preparationKnown: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className="procurement-gallery-card" aria-label={project.name}>
    <Link className="procurement-gallery-card__link" to={procurementProjectPath(project.id)} aria-label={`View project details for ${project.name}`}>
      <div className="procurement-gallery-card__cover">
        {!imageFailed ? <img src={resolveProcurementProjectImage(project.id)} alt="" width="960" height="400" loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : null}
      </div>
      <div className="procurement-gallery-card__body">
        <div className="procurement-gallery-card__identity">
          <h3>{project.name}</h3>
          <div className="procurement-gallery-card__details">{project.clientName ? <span>{project.clientName}</span> : null}{project.location ? <span>{project.location}</span> : null}</div>
          <p className="procurement-gallery-card__sections">{preparationKnown ? "Awaiting procurement preparation" : "Preparation status unavailable"}</p>
          <p className="procurement-gallery-card__sections">Project details are available to your assigned team.</p>
        </div>
        <span className="procurement-gallery-card__action">View project</span>
      </div>
    </Link>
  </article>;
}

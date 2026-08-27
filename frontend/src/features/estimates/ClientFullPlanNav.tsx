import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { EstimatePlanClientWorkspace, EstimatePlanPage } from "../../api/types";
import { ProtectedImage } from "../../components/design/ProtectedImage";

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

export function ClientFullPlanNav({
  workspace,
  selectedPageId,
  onSelectPage
}: {
  workspace: EstimatePlanClientWorkspace;
  selectedPageId?: string;
  onSelectPage: (page: EstimatePlanPage) => void;
}) {
  const uploads = workspace.uploads ?? [];
  const content = (
    <div className="client-plan-nav__pages">
        {uploads.map((upload) => {
          const firstPage = upload.pages.slice().sort((left, right) => left.pageNumber - right.pageNumber)[0];
          if (!firstPage) return null;
          return (
          <button
            type="button"
            className="client-plan-nav__page"
            aria-label={`Open uploaded plan ${upload.originalFilename}`}
            aria-current={upload.pages.some((page) => page.id === selectedPageId) ? "page" : undefined}
            onClick={() => onSelectPage(firstPage)}
            key={upload.id}
          >
            <LazyPlanThumbnail source={firstPage.thumbnailUrl} />
            <span className="client-plan-nav__page-meta"><strong>{upload.originalFilename}</strong><small><FileText aria-hidden="true" /> <span>{fileTypeLabel(upload.mimeType)}</span> · {upload.pageCount} {upload.pageCount === 1 ? "page" : "pages"}</small></span>
          </button>
        );})}
    </div>
  );
  return (
    <section className="client-plan-nav" aria-label="Full design plan">
      <header><div><p className="eyebrow">Full design</p><h4>Uploaded plan</h4></div><small>{workspace.pages.length} pages</small></header>
      <details className="client-plan-nav__drawer" open><summary>Uploaded plan · {workspace.pages.length} pages</summary>{content}</details>
    </section>
  );
}

function LazyPlanThumbnail({ source }: { source: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    if (!("IntersectionObserver" in globalThis)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "80px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={host} className="client-plan-nav__thumbnail">
      {visible ? <ProtectedImage source={source} alt="" /> : null}
    </span>
  );
}

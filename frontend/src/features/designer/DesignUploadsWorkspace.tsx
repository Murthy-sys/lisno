import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CropRect, DesignSection } from "../../api/types";
import { SectionEditor } from "../../components/design/SectionEditor";
import {
  addDesignSection,
  designerKeys,
  editDesignSection,
  getDesignSections,
  getDesignVersions,
  removeDesignSection,
  retryDesignExtraction,
  submitDesignSections
} from "./designerApi";

export function DesignUploadsWorkspace({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [notice, setNotice] = useState("");

  const versionsQuery = useQuery({
    queryKey: designerKeys.designVersions(projectId),
    queryFn: () => getDesignVersions(projectId),
    refetchInterval: 3_000
  });
  const versions = versionsQuery.data ?? [];
  const selected = versions.find(({ id }) => id === selectedVersionId) ??
    versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];

  useEffect(() => {
    if (!selectedVersionId && selected) setSelectedVersionId(selected.id);
  }, [selected, selectedVersionId]);

  const canReadSections = selected?.extractionStatus !== "queued" &&
    selected?.extractionStatus !== "processing" &&
    selected?.extractionStatus !== "submitted" &&
    selected?.extractionStatus !== "approved";
  const sectionsQuery = useQuery({
    queryKey: designerKeys.designSections(selected?.id ?? ""),
    queryFn: () => getDesignSections(selected!.id),
    enabled: Boolean(selected && canReadSections)
  });
  const extraction = sectionsQuery.data;
  const status = extraction?.extractionStatus ?? selected?.extractionStatus;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: designerKeys.designSections(selected!.id) }),
      queryClient.invalidateQueries({ queryKey: designerKeys.designVersions(projectId) }),
      queryClient.invalidateQueries({ queryKey: designerKeys.project(projectId) })
    ]);
  };

  const retry = useMutation({
    mutationFn: () => retryDesignExtraction(selected!.id),
    onSuccess: invalidate
  });
  const submit = useMutation({
    mutationFn: () => submitDesignSections(selected!.id),
    onSuccess: async () => {
      setNotice("Sections submitted to the client.");
      await invalidate();
    }
  });
  const add = useMutation({
    mutationFn: (input: { sourcePageId: string; label: string; crop: CropRect }) =>
      addDesignSection(selected!.id, input),
    onSuccess: async () => {
      setAdding(false);
      setNewLabel("");
      await invalidate();
    }
  });

  const pagesById = useMemo(
    () => new Map(extraction?.pages.map((page) => [page.id, page])),
    [extraction?.pages]
  );
  const activeSections = extraction?.sections.filter(({ active }) => active) ?? [];
  const allCropsValid = activeSections.every((section) => {
    const page = pagesById.get(section.revision.sourcePageId);
    const { x, y, width, height } = section.revision.crop;
    return Boolean(
      page &&
      x >= 0 &&
      y >= 0 &&
      width > 0 &&
      height > 0 &&
      x + width <= page.width &&
      y + height <= page.height
    );
  });

  if (versionsQuery.isPending) return <p role="status">Loading design uploads…</p>;
  if (versionsQuery.isError) {
    return (
      <div className="design-uploads-error">
        <p>We couldn't load design uploads.</p>
        <button type="button" onClick={() => void versionsQuery.refetch()}>Try again</button>
      </div>
    );
  }

  return (
    <section className="design-uploads-workspace" aria-labelledby="design-uploads-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">OCR review</p>
          <h2 id="design-uploads-title">Design uploads</h2>
        </div>
        {versions.length > 1 ? (
          <label>
            <span>Design version</span>
            <select value={selected?.id} onChange={(event) => setSelectedVersionId(event.target.value)}>
              {versions.map((item) => <option key={item.id} value={item.id}>Version {item.versionNumber}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {!selected ? <p className="inline-empty">Upload a design to start section extraction.</p> : null}
      {status === "queued" || status === "processing" ? (
        <p className="processing-status" role="status">OCR is processing {selected?.originalFilename}. This page will update when sections are ready.</p>
      ) : null}
      {status === "processing_failed" ? (
        <div className="processing-failure" role="alert">
          <p>We couldn't extract sections from this design. Retry OCR or add sections manually.</p>
          <button type="button" className="button button--secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Retry extraction
          </button>
        </div>
      ) : null}
      {sectionsQuery.isPending && canReadSections ? <p role="status">Loading extracted sections…</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      {activeSections.map((section) => {
        const page = pagesById.get(section.revision.sourcePageId);
        if (!page) return null;
        return (
          <SectionEditor
            key={section.id}
            section={section}
            page={page}
            onSave={async ({ label, crop }) => {
              const updated = await editDesignSection(section.id, {
                version: section.revision.revisionNumber,
                label,
                crop
              });
              queryClient.setQueryData(
                designerKeys.designSections(selected!.id),
                extraction && {
                  ...extraction,
                  sections: extraction.sections.map((item) => item.id === updated.id ? updated : item)
                }
              );
              await queryClient.invalidateQueries({ queryKey: designerKeys.project(projectId) });
            }}
            onRemove={async () => {
              await removeDesignSection(section.id, section.revision.revisionNumber);
              await invalidate();
            }}
            onConflictRefresh={() => sectionsQuery.refetch()}
          />
        );
      })}

      {extraction?.pages.length ? (
        <div className="manual-section">
          {!adding ? (
            <button type="button" className="button button--secondary" onClick={() => setAdding(true)}>
              Add missing section
            </button>
          ) : (
            <form onSubmit={(event) => {
              event.preventDefault();
              const source = extraction.pages[0]!;
              add.mutate({
                sourcePageId: source.id,
                label: newLabel,
                crop: { x: 0, y: 0, width: source.width, height: source.height }
              });
            }}>
              <label>
                <span>New section label</span>
                <input aria-label="New section label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
              </label>
              <button type="submit" className="button button--primary" disabled={!newLabel.trim()}>Create section</button>
            </form>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className="button button--primary submit-sections"
        disabled={
          (status !== "designer_review" && status !== "changes_requested") ||
          activeSections.length === 0 ||
          !allCropsValid ||
          submit.isPending
        }
        onClick={() => submit.mutate()}
      >
        Submit sections to client
      </button>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CropRect, DesignSection } from "../../api/types";
import { CropEditor, cropIsValid } from "../../components/design/CropEditor";
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
  const [actionError, setActionError] = useState("");
  const [draftStates, setDraftStates] = useState<Record<string, { dirty: boolean; valid: boolean }>>({});
  const [manualPageId, setManualPageId] = useState("");
  const [manualCrop, setManualCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });

  const versionsQuery = useQuery({
    queryKey: designerKeys.designVersions(projectId),
    queryFn: () => getDesignVersions(projectId),
    refetchInterval: (query) => {
      const items = query.state.data;
      return items?.some((item) => item.extractionStatus === "queued" || item.extractionStatus === "processing")
        ? 3_000
        : false;
    }
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

  const refresh = async (versionId = selected!.id, includeDrafts = true) => {
    const operations = [
      queryClient.invalidateQueries({ queryKey: designerKeys.designVersions(projectId) }),
      queryClient.invalidateQueries({ queryKey: designerKeys.project(projectId) })
    ];
    if (includeDrafts) {
      operations.push(
        queryClient.invalidateQueries({ queryKey: designerKeys.designExtraction(versionId) }),
        queryClient.invalidateQueries({ queryKey: designerKeys.designSections(versionId) })
      );
    }
    await Promise.all(operations);
  };
  const setVersionStatus = (extractionStatus: NonNullable<typeof selected>["extractionStatus"]) => {
    queryClient.setQueryData(
      designerKeys.designVersions(projectId),
      (current: typeof versions) => current?.map((item) =>
        item.id === selected?.id ? { ...item, extractionStatus } : item
      )
    );
    queryClient.setQueryData(
      designerKeys.designSections(selected!.id),
      (current: typeof extraction) => current ? { ...current, extractionStatus: extractionStatus! } : current
    );
  };

  const retry = useMutation({
    mutationFn: () => retryDesignExtraction(selected!.id),
    onSuccess: async (result) => {
      setActionError("");
      setVersionStatus(result.extractionStatus);
      await refresh(selected!.id, false);
    },
    onError: () => setActionError("Extraction retry failed. Please try again.")
  });
  const submit = useMutation({
    mutationFn: () => submitDesignSections(selected!.id),
    onSuccess: async () => {
      setActionError("");
      setVersionStatus("submitted");
      await refresh(selected!.id, false);
    },
    onError: () => setActionError("Sections could not be submitted. Your edits are unchanged.")
  });
  const add = useMutation({
    mutationFn: (input: { sourcePageId: string; label: string; crop: CropRect }) =>
      addDesignSection(selected!.id, input),
    onSuccess: async (created) => {
      setActionError("");
      queryClient.setQueryData(
        designerKeys.designSections(selected!.id),
        (current: typeof extraction) => current ? {
          ...current,
          sections: [...current.sections, created]
        } : current
      );
      setAdding(false);
      setNewLabel("");
      await refresh();
    },
    onError: () => setActionError("The missing section could not be created. Your draft is unchanged.")
  });

  const pagesById = useMemo(
    () => new Map(extraction?.pages.map((page) => [page.id, page])),
    [extraction?.pages]
  );
  const activeSections = extraction?.sections.filter(({ active }) => active) ?? [];
  const editableSections = activeSections.filter(({ revision }) =>
    revision.reviewStatus === "draft" || revision.reviewStatus === "rejected"
  );
  const rejectedReplacementMissing = status === "changes_requested" &&
    activeSections.some(({ revision }) => revision.reviewStatus === "rejected");
  const terminal = status === "submitted" || status === "approved";
  const showCorrections = status === "designer_review" ||
    status === "changes_requested" ||
    status === "processing_failed";
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
  const hasUnsafeDraft = activeSections.some((section) => {
    const state = draftStates[section.id];
    return state ? state.dirty || !state.valid : false;
  });
  const manualPage = pagesById.get(manualPageId) ?? extraction?.pages[0];

  useEffect(() => {
    if (!manualPage) return;
    setManualPageId(manualPage.id);
    setManualCrop((current) =>
      current.width === 1 && current.height === 1
        ? { x: 0, y: 0, width: manualPage.width, height: manualPage.height }
        : {
            x: Math.min(current.x, manualPage.width - 1),
            y: Math.min(current.y, manualPage.height - 1),
            width: Math.min(current.width, manualPage.width - Math.min(current.x, manualPage.width - 1)),
            height: Math.min(current.height, manualPage.height - Math.min(current.y, manualPage.height - 1))
          }
    );
  }, [manualPage?.id, manualPage?.width, manualPage?.height]);

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
          <p>{extraction?.pages.length
            ? "We couldn't extract all sections. Retry OCR or add sections manually from the available pages."
            : "We couldn't extract this design and no source pages are available for manual sections. Retry OCR."}</p>
          <button type="button" className="button button--secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Retry extraction
          </button>
        </div>
      ) : null}
      {sectionsQuery.isPending && canReadSections ? <p role="status">Loading extracted sections…</p> : null}
      {terminal ? (
        <p className="processing-status" role="status">Sections submitted to the client. This version is read-only.</p>
      ) : null}
      {actionError ? <div role="alert">{actionError} <button type="button" onClick={() => setActionError("")}>Dismiss</button></div> : null}

      {showCorrections ? activeSections.map((section) => {
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
                (current: typeof extraction) => current ? {
                  ...current,
                  sections: current.sections.map((item) => item.id === updated.id ? updated : item)
                } : current
              );
              setActionError("");
              await refresh();
              return updated;
            }}
            onRemove={async () => {
              try {
                await removeDesignSection(section.id, section.revision.revisionNumber);
                setActionError("");
                queryClient.setQueryData(
                  designerKeys.designSections(selected!.id),
                  (current: typeof extraction) => current ? {
                    ...current,
                    sections: current.sections.filter((item) => item.id !== section.id)
                  } : current
                );
                await refresh();
              } catch {
                setActionError("The section could not be removed. It remains in the review set.");
              }
            }}
            onConflictRefresh={() => sectionsQuery.refetch()}
            onDraftState={(state) =>
              setDraftStates((current) => {
                const previous = current[section.id];
                if (previous?.dirty === state.dirty && previous.valid === state.valid) return current;
                return { ...current, [section.id]: state };
              })
            }
            locked={terminal}
          />
        );
      }) : null}

      {showCorrections && extraction?.pages.length && !terminal ? (
        <div className="manual-section">
          {!adding ? (
            <button type="button" className="button button--secondary" onClick={() => setAdding(true)}>
              Add missing section
            </button>
          ) : (
            <form onSubmit={(event) => {
              event.preventDefault();
              if (!manualPage) return;
              add.mutate({
                sourcePageId: manualPage.id,
                label: newLabel,
                crop: manualCrop
              });
            }}>
              <label>
                <span>Source page</span>
                <select aria-label="Source page" value={manualPage?.id ?? ""} onChange={(event) => setManualPageId(event.target.value)}>
                  {extraction.pages.map((page) => <option key={page.id} value={page.id}>Page {page.pageNumber}</option>)}
                </select>
              </label>
              <label>
                <span>New section label</span>
                <input aria-label="New section label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
              </label>
              {manualPage ? <CropEditor label={newLabel || "New section"} crop={manualCrop} page={manualPage} onChange={setManualCrop} /> : null}
              <button type="submit" className="button button--primary" disabled={!newLabel.trim() || !manualPage || !cropIsValid(manualCrop, manualPage)}>Create section</button>
            </form>
          )}
        </div>
      ) : null}

      {showCorrections || terminal ? <button
        type="button"
        className="button button--primary submit-sections"
        disabled={
          (status !== "designer_review" && status !== "changes_requested") ||
          activeSections.length === 0 ||
          editableSections.length === 0 ||
          rejectedReplacementMissing ||
          !allCropsValid ||
          hasUnsafeDraft ||
          adding ||
          submit.isPending
        }
        onClick={() => submit.mutate()}
      >
        Submit sections to client
      </button> : null}
    </section>
  );
}

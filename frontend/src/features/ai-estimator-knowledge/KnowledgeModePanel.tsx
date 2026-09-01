import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import {
  getKnowledgeItem,
  getKnowledgeSection,
  previewKnowledge,
  updateKnowledgeSection,
  type KnowledgePreviewRequest
} from "./knowledgeApi";
import {
  commitKnowledgeSectionMutation,
  invalidateKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import {
  formatKnowledgeMoney,
  formatKnowledgePercentage,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise
} from "./knowledgePresentation";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { knowledgeSectionPayloadForUpdate } from "./knowledgeSectionPayload";
import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import {
  KnowledgeModeConfigurationBuilder,
  type KnowledgeLegacyModeCatalogState
} from "./KnowledgeModeConfigurationBuilder";
import type { KnowledgeModeConfigurationIssue } from "./knowledgeModeConfiguration";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import type {
  KnowledgeBasket,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgePreview,
  KnowledgeSectionApplicability,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const MODE_SECTION_KEYS = [
  "advanced",
  "pricing",
  "quantity-margin"
] as const satisfies readonly KnowledgeSectionKey[];

type ModeSectionKey = (typeof MODE_SECTION_KEYS)[number];

const MODE_SECTION_LABELS = {
  advanced: "Mode configuration",
  pricing: "Pricing",
  "quantity-margin": "Quantity & margin"
} as const satisfies Readonly<Record<ModeSectionKey, string>>;

interface ModeDraft {
  readonly payload: KnowledgeJsonObject;
  readonly specificationReferenceIds: readonly string[];
  readonly applicability: KnowledgeSectionApplicability;
  readonly envelopeVersion: number | null;
  readonly valid: boolean;
  readonly dirty: boolean;
  readonly validationAttempt: number;
  readonly error: string | null;
  readonly serverIssues: readonly KnowledgeModeConfigurationIssue[];
  readonly serverReview: ModeServerReview | null;
}

interface ModeServerReview {
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

interface ModeConflict {
  readonly sectionKey: ModeSectionKey;
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

export interface KnowledgeModePanelHandle {
  readonly save: () => Promise<boolean>;
  readonly discard: () => void;
}

export interface KnowledgeModePanelProps {
  readonly item: KnowledgeItemDetail;
  readonly revisionId: string;
  readonly masters: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>
  >;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly editable: boolean;
  readonly canQuickAdd: boolean;
  readonly legacyModeCatalogState: KnowledgeLegacyModeCatalogState;
  readonly onQuickAdd: (
    type: KnowledgeMasterType,
    select: (master: KnowledgeMaster) => void
  ) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSaveErrorChange?: (error: string | null) => void;
  readonly onAnnouncement: (message: string) => void;
}

export const KnowledgeModePanel = forwardRef<
  KnowledgeModePanelHandle,
  KnowledgeModePanelProps
>(function KnowledgeModePanel(
  {
    item,
    revisionId,
    masters,
    relationshipBaskets,
    relationshipItems,
    editable,
    canQuickAdd,
    legacyModeCatalogState,
    onQuickAdd,
    onDirtyChange,
    onSavingChange,
    onBusyChange,
    onSaveErrorChange = ignoreSaveError,
    onAnnouncement
  },
  ref
) {
  const queryClient = useQueryClient();
  const mainLineId = item.mainLineId;
  const advancedQuery = useModeSectionQuery(mainLineId, revisionId, "advanced");
  const pricingQuery = useModeSectionQuery(mainLineId, revisionId, "pricing");
  const quantityQuery = useModeSectionQuery(
    mainLineId,
    revisionId,
    "quantity-margin"
  );
  const [drafts, setDrafts] = useState(createEmptyModeDrafts);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<ModeSectionKey | null>(null);
  const [conflict, setConflict] = useState<ModeConflict | null>(null);
  const aggregateBaselineRef = useRef({
    revisionId,
    version: item.version
  });
  if (aggregateBaselineRef.current.revisionId !== revisionId) {
    aggregateBaselineRef.current = { revisionId, version: item.version };
  }

  useEffect(() => {
    setDrafts(createEmptyModeDrafts());
    setConflict(null);
  }, [revisionId]);

  useEffect(() => {
    const envelopes = {
      advanced: advancedQuery.data,
      pricing: pricingQuery.data,
      "quantity-margin": quantityQuery.data
    };

    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const sectionKey of MODE_SECTION_KEYS) {
        const envelope = envelopes[sectionKey];
        const draft = current[sectionKey];
        if (
          !envelope ||
          draft.dirty ||
          (draft.envelopeVersion !== null &&
            envelope.version <= draft.envelopeVersion)
        ) {
          continue;
        }
        next[sectionKey] = draftFromEnvelope(envelope);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [advancedQuery.data, pricingQuery.data, quantityQuery.data]);

  const dirty = MODE_SECTION_KEYS.some((sectionKey) => drafts[sectionKey].dirty);
  const busy = advancedQuery.isFetching || pricingQuery.isFetching || quantityQuery.isFetching;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onSavingChange(saving), [onSavingChange, saving]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const saveError = MODE_SECTION_KEYS
    .map((sectionKey) => drafts[sectionKey].error)
    .find((error): error is string => Boolean(error)) ?? null;
  useEffect(() => onSaveErrorChange(saveError), [onSaveErrorChange, saveError]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      onSavingChange(false);
      onBusyChange(false);
      onSaveErrorChange(null);
    },
    [onBusyChange, onDirtyChange, onSaveErrorChange, onSavingChange]
  );

  const setPayload = useCallback(
    (sectionKey: ModeSectionKey, payload: KnowledgeJsonObject) => {
      setDrafts((current) => ({
        ...current,
        [sectionKey]: { ...current[sectionKey], payload }
      }));
    },
    []
  );
  const markDirty = useCallback((sectionKey: ModeSectionKey) => {
    setDrafts((current) => ({
      ...current,
      [sectionKey]: {
        ...current[sectionKey],
        dirty: true,
        error: null,
        serverIssues: []
      }
    }));
  }, []);
  const markAdvancedConfigurationDirty = useCallback(() => {
    setDrafts((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        applicability: "configured",
        dirty: true,
        error: null,
        serverIssues: []
      }
    }));
  }, []);
  const setValid = useCallback((sectionKey: ModeSectionKey, valid: boolean) => {
    setDrafts((current) => {
      if (current[sectionKey].valid === valid) return current;
      return {
        ...current,
        [sectionKey]: { ...current[sectionKey], valid }
      };
    });
  }, []);
  const setPricingValid = useCallback(
    (valid: boolean) => setValid("pricing", valid),
    [setValid]
  );
  const setAdvancedValid = useCallback(
    (valid: boolean) => setValid("advanced", valid),
    [setValid]
  );
  const setQuantityValid = useCallback(
    (valid: boolean) => setValid("quantity-margin", valid),
    [setValid]
  );

  const discard = useCallback(() => {
    setDrafts({
      advanced: advancedQuery.data
        ? draftFromEnvelope(advancedQuery.data)
        : emptyModeDraft(),
      pricing: pricingQuery.data
        ? draftFromEnvelope(pricingQuery.data)
        : emptyModeDraft(),
      "quantity-margin": quantityQuery.data
        ? draftFromEnvelope(quantityQuery.data)
        : emptyModeDraft()
    });
    setConflict(null);
  }, [advancedQuery.data, pricingQuery.data, quantityQuery.data]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editable || saving) return false;
    const snapshot = drafts;
    const dirtySections = MODE_SECTION_KEYS.filter(
      (sectionKey) => snapshot[sectionKey].dirty
    );
    if (!dirtySections.length) return true;

    let expectedAggregateVersion = aggregateBaselineRef.current.version;
    let committedAnySection = false;
    setSaving(true);
    setConflict(null);
    setDrafts((current) =>
      Object.fromEntries(
        MODE_SECTION_KEYS.map((sectionKey) => [
          sectionKey,
          { ...current[sectionKey], error: null }
        ])
      ) as unknown as Record<ModeSectionKey, ModeDraft>
    );

    try {
      for (const sectionKey of dirtySections) {
        const draft = snapshot[sectionKey];
        if (!draft.valid || draft.envelopeVersion === null) {
          setDrafts((current) => ({
            ...current,
            [sectionKey]: {
              ...current[sectionKey],
              validationAttempt: current[sectionKey].validationAttempt + 1,
              error:
                draft.envelopeVersion === null
                  ? `${MODE_SECTION_LABELS[sectionKey]} is not loaded yet.`
                  : `Review ${MODE_SECTION_LABELS[sectionKey]} before saving.`
            }
          }));
          return false;
        }

        setSavingSection(sectionKey);
        try {
          const saved = await updateKnowledgeSection(
            mainLineId,
            revisionId,
            sectionKey,
            {
              expectedVersion: draft.envelopeVersion,
              expectedAggregateVersion,
              applicability: draft.applicability,
              payload: modeSectionPayloadForUpdate(
                sectionKey,
                draft.payload
              )
            }
          );
          expectedAggregateVersion = saved.aggregateVersion;
          aggregateBaselineRef.current = {
            revisionId,
            version: saved.aggregateVersion
          };
          commitKnowledgeSectionMutation(queryClient, saved);
          setDrafts((current) => ({
            ...current,
            [sectionKey]: draftFromEnvelope(saved)
          }));
          committedAnySection = true;
        } catch (failure) {
          if (
            failure instanceof ApiError &&
            failure.code === "VERSION_CONFLICT"
          ) {
            try {
              const [latestSection, latestItem] = await Promise.all([
                getKnowledgeSection<KnowledgeJsonObject>(
                  mainLineId,
                  revisionId,
                  sectionKey
                ),
                getKnowledgeItem(mainLineId)
              ]);
              queryClient.setQueryData(
                knowledgeQueryKeys.section(mainLineId, revisionId, sectionKey),
                latestSection
              );
              queryClient.setQueryData(
                knowledgeQueryKeys.item(mainLineId),
                latestItem
              );
              aggregateBaselineRef.current = {
                revisionId,
                version: latestItem.version
              };
              setConflict({
                sectionKey,
                localVersion: draft.envelopeVersion,
                server: latestSection
              });
            } catch (refreshFailure) {
              const refreshMessage = refreshFailure instanceof Error
                ? refreshFailure.message
                : "The latest server version could not be loaded.";
              setDrafts((current) => ({
                ...current,
                [sectionKey]: {
                  ...current[sectionKey],
                  error: `A version conflict occurred, but the latest server version could not be loaded. ${refreshMessage}`
                }
              }));
            }
          } else {
            const message =
              failure instanceof Error
                ? failure.message
                : "This block could not be saved.";
            const serverIssues = failure instanceof ApiError
              ? sectionIssuesFromApiError(
                  failure,
                  sectionKey === "advanced"
                    ? ["modeConfigurations"]
                    : sectionKey === "pricing"
                      ? ["specifications", "brands"]
                      : []
                )
              : [];
            setDrafts((current) => ({
              ...current,
              [sectionKey]: {
                ...current[sectionKey],
                error: message,
                serverIssues
              }
            }));
          }
          return false;
        }
      }

      onAnnouncement("Mode saved.");
      return true;
    } finally {
      if (committedAnySection) {
        void invalidateKnowledgeSectionMutation(queryClient, mainLineId).catch(
          () => undefined
        );
      }
      setSavingSection(null);
      setSaving(false);
    }
  }, [drafts, editable, mainLineId, onAnnouncement, queryClient, revisionId, saving]);

  useImperativeHandle(ref, () => ({ save, discard }), [discard, save]);

  const renderBlock = (
    sectionKey: ModeSectionKey,
    query: UseQueryResult<KnowledgeSectionEnvelope<KnowledgeJsonObject>, Error>,
    editor: ReactNode
  ) => {
    const label = MODE_SECTION_LABELS[sectionKey];
    const draft = drafts[sectionKey];
    if (query.isPending) {
      return <PageState key={sectionKey} state="loading" message={`Loading ${label}…`} />;
    }
    if (query.isError) {
      return (
        <PageState
          key={sectionKey}
          state="error"
          message={`${label}: ${query.error.message}`}
          action={{ label: `Retry ${label}`, onAction: () => void query.refetch() }}
        />
      );
    }
    if (!query.data) {
      return (
        <PageState
          key={sectionKey}
          state="empty"
          message={`${label} is unavailable for this revision.`}
        />
      );
    }

    return (
      <Surface
        key={sectionKey}
        as="section"
        aria-label={label}
        className="knowledge-workspace-section knowledge-mode-block"
      >
        {sectionKey === "pricing" ? <h2 className="sr-only">{label}</h2> : null}
        <ModeBlockToolbar
          draft={draft}
          saving={savingSection === sectionKey}
        />
        {draft.serverReview ? (
          <KnowledgeConflictReview
            sectionKey={sectionKey}
            localVersion={draft.serverReview.localVersion}
            serverVersion={draft.serverReview.server.version}
            payload={draft.serverReview.server.payload}
            masters={masters}
            relationshipBaskets={relationshipBaskets}
            relationshipItems={relationshipItems}
          />
        ) : null}
        {editor}
        {draft.error ? (
          <InlineMessage tone="error" role="alert" title={`${label} could not be saved`}>
            {label}: {draft.error}
          </InlineMessage>
        ) : null}
      </Surface>
    );
  };

  return (
    <div className="knowledge-mode-panel">
      {renderBlock(
        "advanced",
        advancedQuery,
        <KnowledgeModeConfigurationBuilder
          payload={drafts.advanced.payload}
          modes={masters.modes ?? []}
          legacyModeCatalogState={legacyModeCatalogState}
          serverIssues={drafts.advanced.serverIssues}
          readOnly={!editable || saving}
          validationAttempt={drafts.advanced.validationAttempt}
          onChange={(payload) => setPayload("advanced", payload)}
          onDirty={markAdvancedConfigurationDirty}
          onValidationChange={setAdvancedValid}
        />
      )}
      {renderBlock(
        "pricing",
        pricingQuery,
        <KnowledgeSectionEditor
          sectionKey="pricing"
          payload={drafts.pricing.payload}
          masters={masters}
          relationshipBaskets={relationshipBaskets}
          relationshipItems={relationshipItems}
          currentMainLineId={mainLineId}
          readOnly={!editable || saving}
          canQuickAdd={canQuickAdd && !saving}
          resetKey={`${revisionId}-pricing-${drafts.pricing.envelopeVersion ?? "pending"}`}
          specificationScopeKey={revisionId}
          specificationReferenceIds={drafts.pricing.specificationReferenceIds}
          validationAttempt={drafts.pricing.validationAttempt}
          serverIssues={drafts.pricing.serverIssues}
          onChange={(payload) => setPayload("pricing", payload)}
          onDirty={() => markDirty("pricing")}
          onValidationChange={setPricingValid}
          onQuickAdd={onQuickAdd}
        />
      )}
      {renderBlock(
        "quantity-margin",
        quantityQuery,
        <>
          <KnowledgeSectionEditor
            sectionKey="quantity-margin"
            payload={drafts["quantity-margin"].payload}
            masters={masters}
            relationshipBaskets={relationshipBaskets}
            relationshipItems={relationshipItems}
            currentMainLineId={mainLineId}
            readOnly={!editable || saving}
            canQuickAdd={canQuickAdd && !saving}
            resetKey={`${revisionId}-quantity-margin-${drafts["quantity-margin"].envelopeVersion ?? "pending"}`}
            validationAttempt={drafts["quantity-margin"].validationAttempt}
            onChange={(payload) => setPayload("quantity-margin", payload)}
            onDirty={() => markDirty("quantity-margin")}
            onValidationChange={setQuantityValid}
            onQuickAdd={onQuickAdd}
          />
          <KnowledgePreviewPanel disabled={saving} />
        </>
      )}

      {conflict ? (
        <KnowledgeVersionConflictDialog
          sectionLabel={MODE_SECTION_LABELS[conflict.sectionKey]}
          localVersion={conflict.localVersion}
          serverVersion={conflict.server.version}
          onKeepEditing={() => setConflict(null)}
          onReviewServerVersion={() => {
            setDrafts((current) => ({
              ...current,
              [conflict.sectionKey]: {
                ...current[conflict.sectionKey],
                serverReview: {
                  localVersion: conflict.localVersion,
                  server: conflict.server
                }
              }
            }));
            setConflict(null);
          }}
          onDiscardLocalChanges={() => {
            setDrafts((current) => ({
              ...current,
              [conflict.sectionKey]: draftFromEnvelope(conflict.server)
            }));
            setConflict(null);
          }}
        />
      ) : null}
    </div>
  );
});

function useModeSectionQuery(
  mainLineId: string,
  revisionId: string,
  sectionKey: ModeSectionKey
) {
  return useQuery({
    queryKey: knowledgeQueryKeys.section(mainLineId, revisionId, sectionKey),
    queryFn: () =>
      getKnowledgeSection<KnowledgeJsonObject>(
        mainLineId,
        revisionId,
        sectionKey
      ),
    enabled: Boolean(mainLineId && revisionId)
  });
}

function ignoreSaveError() {
  // Parent error reporting is optional for standalone Mode panel consumers.
}

function emptyModeDraft(): ModeDraft {
  return {
    payload: {},
    specificationReferenceIds: [],
    applicability: "not_configured",
    envelopeVersion: null,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null
  };
}

function createEmptyModeDrafts(): Record<ModeSectionKey, ModeDraft> {
  return {
    advanced: emptyModeDraft(),
    pricing: emptyModeDraft(),
    "quantity-margin": emptyModeDraft()
  };
}

function draftFromEnvelope(
  envelope: KnowledgeSectionEnvelope<KnowledgeJsonObject>
): ModeDraft {
  return {
    payload: envelope.payload,
    specificationReferenceIds: envelope.referenceState?.specificationIds ?? [],
    applicability: envelope.applicability,
    envelopeVersion: envelope.version,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null
  };
}

function sectionIssuesFromApiError(
  failure: ApiError,
  allowedRootPaths: readonly ("modeConfigurations" | "specifications" | "brands")[]
): readonly KnowledgeModeConfigurationIssue[] {
  if (allowedRootPaths.length === 0) return [];
  return Object.entries(failure.fields ?? {}).flatMap(([path, message]) => {
    const normalizedPath = path.startsWith("payload.")
      ? path.slice("payload.".length)
      : path;
    return allowedRootPaths.some((rootPath) =>
      normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}.`)
    )
      ? [{ path: normalizedPath, message }]
      : [];
  });
}

function modeSectionPayloadForUpdate(
  sectionKey: ModeSectionKey,
  payload: KnowledgeJsonObject
): KnowledgeJsonObject {
  const prepared = knowledgeSectionPayloadForUpdate(sectionKey, payload);
  if (sectionKey !== "pricing" || !Array.isArray(prepared.priceEntries)) {
    return prepared;
  }

  return {
    ...prepared,
    priceEntries: prepared.priceEntries.map((entry) => {
      if (
        entry === null ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        entry.operation !== "append"
      ) {
        return entry;
      }
      return { ...entry, specificationId: null };
    })
  };
}

function ModeBlockToolbar({
  draft,
  saving
}: {
  readonly draft: ModeDraft;
  readonly saving: boolean;
}) {
  return (
    <div className="knowledge-section-toolbar knowledge-mode-block__toolbar">
      <span className="knowledge-section-toolbar__meta">
        Section version {draft.envelopeVersion ?? "Unavailable"}
      </span>
      {draft.dirty ? (
        <span className="knowledge-mode-block__dirty">
          {saving ? "Saving…" : "Unsaved changes"}
        </span>
      ) : null}
    </div>
  );
}

function KnowledgePreviewPanel({ disabled }: { readonly disabled: boolean }) {
  const [unitRateRupees, setUnitRateRupees] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityScale, setQuantityScale] = useState("0");
  const [quantityAdjustmentBps, setQuantityAdjustmentBps] = useState("");
  const [wastageBps, setWastageBps] = useState("");
  const [taxRateBps, setTaxRateBps] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">(
    "exclusive"
  );
  const [startMarginBps, setStartMarginBps] = useState("");
  const [bottomMarginBps, setBottomMarginBps] = useState("");
  const [pmcMarkupBps, setPmcMarkupBps] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KnowledgePreview | null>(null);
  const parsedUnitRate = parseRupeeInputToPaise(unitRateRupees);
  const unitRateError =
    unitRateRupees === "" || parsedUnitRate.status === "valid"
      ? undefined
      : parsedUnitRate.status === "incomplete"
        ? "Complete the rupee amount with one or two digits after the decimal point."
        : parsedUnitRate.reason === "unsafe"
          ? "Enter a rupee amount within the supported range."
          : "Enter a non-negative rupee amount with no more than two decimal places.";
  const ready =
    parsedUnitRate.status === "valid" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(quantity) &&
    isBoundedInteger(quantityScale, 0, 18);

  async function runPreview() {
    setPending(true);
    setError(null);
    try {
      setPreview(
        await previewKnowledge(
          previewRequest({
            unitRateRupees,
            quantity,
            quantityScale,
            quantityAdjustmentBps,
            wastageBps,
            taxRateBps,
            taxTreatment,
            startMarginBps,
            bottomMarginBps,
            pmcMarkupBps
          })
        )
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The preview could not be run."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface
      as="section"
      variant="subtle"
      className="knowledge-preview-panel"
      aria-labelledby="knowledge-preview-title"
    >
      <div className="knowledge-section-heading">
        <div>
          <h3 id="knowledge-preview-title">Server calculation preview</h3>
          <p>
            The server remains authoritative for monetary amounts, percentages,
            and canonical decimal quantities; the client does not calculate totals.
          </p>
        </div>
      </div>
      <div className="knowledge-form-grid">
        <Field
          id="preview-rate"
          label="Unit rate (₹)"
          hint="Enter a non-negative rupee amount with up to two decimal places, for example 0, 0.01, or 125.50."
          error={unitRateError}
        >
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              value={unitRateRupees}
              onChange={(event) => setUnitRateRupees(event.target.value)}
              onBlur={() => {
                if (parsedUnitRate.status === "valid") {
                  setUnitRateRupees(
                    formatPaiseForRupeeInput(parsedUnitRate.paise)
                  );
                }
              }}
            />
          )}
        </Field>
        <PreviewInput id="preview-quantity" label="Quantity" value={quantity} setValue={setQuantity} text />
        <PreviewInput id="preview-scale" label="Quantity scale" value={quantityScale} setValue={setQuantityScale} />
        <PreviewInput id="preview-adjustment" label="Quantity adjustment (BPS)" value={quantityAdjustmentBps} setValue={setQuantityAdjustmentBps} />
        <PreviewInput id="preview-wastage" label="Wastage (BPS)" value={wastageBps} setValue={setWastageBps} />
        <PreviewInput id="preview-tax" label="Tax rate (BPS)" value={taxRateBps} setValue={setTaxRateBps} />
        {taxRateBps !== "" ? (
          <Field id="preview-treatment" label="Tax treatment">
            {(props) => (
              <Select
                {...props}
                value={taxTreatment}
                onChange={(event) =>
                  setTaxTreatment(event.target.value as typeof taxTreatment)
                }
              >
                <option value="exclusive">Exclusive</option>
                <option value="inclusive">Inclusive</option>
              </Select>
            )}
          </Field>
        ) : null}
        <PreviewInput id="preview-start-margin" label="Start margin (BPS)" value={startMarginBps} setValue={setStartMarginBps} />
        <PreviewInput id="preview-bottom-margin" label="Bottom margin (BPS)" value={bottomMarginBps} setValue={setBottomMarginBps} />
        <PreviewInput id="preview-pmc" label="PMC markup (BPS)" value={pmcMarkupBps} setValue={setPmcMarkupBps} />
      </div>
      <div className="knowledge-preview-actions">
        <Button
          variant="secondary"
          busy={pending}
          disabled={disabled || !ready}
          onClick={() => void runPreview()}
        >
          Run server preview
        </Button>
      </div>
      {error ? (
        <InlineMessage tone="error" role="alert">{error}</InlineMessage>
      ) : preview ? (
        <KnowledgePreviewResult preview={preview} />
      ) : null}
    </Surface>
  );
}

function PreviewInput({
  id,
  label,
  value,
  setValue,
  text = false
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly text?: boolean;
}) {
  return (
    <Field id={id} label={label}>
      {(props) => (
        <Input
          {...props}
          type={text ? "text" : "number"}
          min={text ? undefined : 0}
          step={text ? undefined : 1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
    </Field>
  );
}

function previewRequest(
  values: Readonly<{
    unitRateRupees: string;
    quantity: string;
    quantityScale: string;
    quantityAdjustmentBps: string;
    wastageBps: string;
    taxRateBps: string;
    taxTreatment: string;
    startMarginBps: string;
    bottomMarginBps: string;
    pmcMarkupBps: string;
  }>
): KnowledgePreviewRequest {
  const unitRate = parseRupeeInputToPaise(values.unitRateRupees);
  if (unitRate.status !== "valid") {
    throw new Error("Enter a valid unit rate in rupees before running the preview.");
  }
  const integer = (value: string) => (value === "" ? undefined : Number(value));
  const taxRateBps = integer(values.taxRateBps);
  return {
    unitRatePaise: unitRate.paise,
    quantity: values.quantity || null,
    quantityScale: Number(values.quantityScale),
    quantityAdjustmentBps: integer(values.quantityAdjustmentBps),
    wastageBps: integer(values.wastageBps),
    taxRateBps,
    ...(taxRateBps === undefined
      ? {}
      : { taxTreatment: values.taxTreatment as "exclusive" | "inclusive" }),
    startMarginBps: integer(values.startMarginBps),
    bottomMarginBps: integer(values.bottomMarginBps),
    pmcMarkupBps: integer(values.pmcMarkupBps)
  };
}

function isBoundedInteger(
  value: string,
  minimum: number,
  maximum: number
): boolean {
  return (
    value !== "" &&
    Number.isInteger(Number(value)) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function KnowledgePreviewResult({ preview }: { readonly preview: KnowledgePreview }) {
  const amounts = [
    ["Effective unit rate", preview.effectiveUnitRatePaise],
    ["Vendor pre-tax", preview.vendorPreTax?.amountPaise],
    ["Vendor tax", preview.vendorTax?.amountPaise],
    ["Vendor total", preview.vendorTotal?.amountPaise],
    ["Start margin", preview.startMargin?.amountPaise],
    ["Bottom margin", preview.bottomMargin?.amountPaise],
    ["PMC markup", preview.pmcMarkup?.amountPaise]
  ] as const;
  return (
    <div className="knowledge-preview-result" role="status">
      <h4>Preview components</h4>
      <dl>
        {amounts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{typeof value === "number" ? formatKnowledgeMoney(value) : "Not resolved"}</dd>
          </div>
        ))}
        <div>
          <dt>Procurement quantity</dt>
          <dd>{preview.procurementQuantity ?? "Not resolved"}</dd>
        </div>
        {preview.startMargin?.rateBps !== null &&
        preview.startMargin?.rateBps !== undefined ? (
          <div>
            <dt>Start margin rate</dt>
            <dd>{formatKnowledgePercentage(preview.startMargin.rateBps)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

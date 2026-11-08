import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type RefObject } from "react";
import { calculateDimensionQuantity } from "../../../../shared/estimation/estimateDimensions";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { EstimateLineChoice, EstimateLineLayout, EstimateLineTierNotes, EstimateLineTierOptions } from "../estimates/EstimateLineRow";
import { EstimatePricingModeControl } from "../estimates/EstimatePricingModeControl";
import { configuredTierPricing, configuredTierUnavailableReason } from "../leads/configuredEstimate";
import { emptyEstimateDimensions, EstimateDimensionsFields } from "../leads/EstimateDimensionsFields";
import { estimationCatalogueKeys, getEstimationCatalogue, type EstimationCatalogue, type EstimationCatalogueMainLine, type EstimationCatalogueTemporaryItem } from "../leads/estimationCatalogueApi";
import type { EstimateClassification, EstimatePricingMode } from "../leads/leadsApi";
import "../../styles/estimator-dashboard.css";
import "../client/clientQuotation.css";
import "./knowledge-main-line-client-preview.css";

export interface KnowledgeMainLineClientPreviewProps {
  open: boolean;
  mainLineId: string;
  mainLineName: string;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

type PreviewLine = EstimationCatalogueMainLine | EstimationCatalogueTemporaryItem;
interface PreviewSource { line: PreviewLine; basketName: string; subBasketName: string | null }

function findPreviewSource(catalogue: EstimationCatalogue, mainLineId: string): PreviewSource | undefined {
  for (const basket of catalogue.items) {
    for (const subBasket of basket.subBaskets) {
      const line = [...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])].find(candidate =>
        candidate.mainLineId === mainLineId && candidate.basketId === basket.id && candidate.subBasketId === subBasket.id);
      if (line) return { line, basketName: basket.name, subBasketName: subBasket.name };
    }
    const line = basket.directTemporaryItems?.find(candidate => candidate.mainLineId === mainLineId && candidate.basketId === basket.id && candidate.subBasketId === null);
    if (line) return { line, basketName: basket.name, subBasketName: null };
  }
  return undefined;
}

/** Mount a fresh session on each opening; no editor or quotation state is shared. */
export function KnowledgeMainLineClientPreview(props: KnowledgeMainLineClientPreviewProps) {
  return props.open ? <ClientPreviewSession key={props.mainLineId} {...props} /> : null;
}

function ClientPreviewSession({ mainLineId, mainLineName, hasUnsavedChanges, onClose, returnFocusRef }: KnowledgeMainLineClientPreviewProps) {
  // A previous opening may still be loading when Configuration is saved.
  // Do not let that pending request supply the next opening's preview.
  const sessionId = useId();
  const query = useQuery({
    queryKey: [...estimationCatalogueKeys.all, "client-preview", mainLineId, sessionId],
    queryFn: () => getEstimationCatalogue({ includeReadyNonActive: true }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false
  });
  const source = query.data ? findPreviewSource(query.data, mainLineId) : undefined;
  return <Drawer id="knowledge-main-line-client-preview" open title="Client view" variant="contextual" width="wide" side="right"
    className="knowledge-client-preview" onClose={onClose} returnFocusRef={returnFocusRef}
    description="Preview only. Try the client controls here without changing your configuration or an estimate."
    metadata={<p className="knowledge-client-preview__name">{mainLineName}</p>}>
    {hasUnsavedChanges ? <p className="knowledge-client-preview__notice" role="status">Preview uses saved configuration. Save your changes to update it.</p> : null}
    {query.isPending || query.isFetching ? <p className="knowledge-client-preview__state" role="status">Loading saved configuration…</p>
      : query.isError ? <div className="knowledge-client-preview__state" role="alert"><p>Client preview could not be loaded. Retry to read the current saved configuration.</p><Button size="compact" variant="secondary" onClick={() => void query.refetch()}>Retry preview</Button></div>
      : query.data?.readyNonActiveSupported === false ? <p className="knowledge-client-preview__state" role="status">The current saved configuration cannot be previewed with this catalogue version. Refresh after the catalogue service is updated.</p>
      : !source ? <p className="knowledge-client-preview__state" role="status">This Main Line is not available in the current estimator catalogue. Review its saved configuration and availability.</p>
      : source.line.clientVisible === false ? <p className="knowledge-client-preview__state" role="status">This Main Line is hidden from clients.</p>
      : <ClientPreviewRow key={`${source.line.mainLineId}:${source.line.revisionId}:${source.line.revisionVersion ?? ""}:${source.line.itemVersion ?? ""}`} source={source} />}
  </Drawer>;
}

const money = (paise: number | null | undefined) => typeof paise === "number" && Number.isSafeInteger(paise) && paise >= 0
  ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100)
  : "Pending";

function ClientPreviewRow({ source: { line, basketName, subBasketName } }: { source: PreviewSource }) {
  const [classification, setClassification] = useState<EstimateClassification>("standard");
  const [mode, setMode] = useState<EstimatePricingMode>("sub_vendor");
  const nonPmcMode = useRef<"sub_vendor" | "in_house">("sub_vendor");
  const [tier, setTier] = useState<KnowledgeModeTier>(() => KNOWLEDGE_MODE_TIERS.find(value =>
    configuredTierUnavailableReason(line, value, "sub_vendor") === null) ?? line.applicableTiers?.[0] ?? "signature");
  const [quantity, setQuantity] = useState("1");
  const [included, setIncluded] = useState(true);
  const [components, setComponents] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState(emptyEstimateDimensions);
  const tierAvailabilityId = useId();
  const quantityNumber = Number(quantity);
  const pricing = configuredTierPricing(line, tier);
  const inHouseComponents = mode === "in_house" ? pricing?.inHouseComponents : undefined;
  const unavailableReason = configuredTierUnavailableReason(line, tier, mode);
  const measured = line.dimensionsMandatory ? calculateDimensionQuantity(line.dimensionRule, dimensions) : null;
  const tierOptions = KNOWLEDGE_MODE_TIERS.map(value => ({ value, label: KNOWLEDGE_MODE_TIER_LABELS[value],
    disabledReason: configuredTierUnavailableReason(line, value, mode) ? "Unavailable" : null }));
  const changeMode = (next: EstimatePricingMode) => {
    if (next !== "pmc") nonPmcMode.current = next;
    setMode(next);
    setComponents([]);
  };
  const stepQuantity = (direction: -1 | 1) => {
    const next = (Number.isFinite(quantityNumber) ? quantityNumber : 0) + direction;
    const [coefficient, exponent = "0"] = quantityNumber.toString().split("e");
    const precision = Math.max(0, (coefficient?.split(".")[1]?.length ?? 0) - Number(exponent));
    if (next > 0 && Number.isFinite(next)) setQuantity(String(Number(next.toFixed(Math.min(100, precision)))));
  };
  return <div className="knowledge-client-preview__content">
    <div className="knowledge-client-preview__context">
      <p>{basketName}{subBasketName ? ` / ${subBasketName}` : ""}</p>
      <label className="knowledge-client-preview__scenario"><span>Preview type</span><select value={classification} onChange={event => {
        const next = event.target.value === "special" ? "special" : "standard";
        setClassification(next);
        if (next === "standard") changeMode("sub_vendor");
      }}><option value="standard">Standard</option><option value="special">Special</option></select></label>
    </div>
    <div className="client-quotation estimate-workspace estimator-dashboard knowledge-client-preview__estimate">
      <EstimateLineLayout included={included} label={`Client preview of ${line.name}`} className="client-quotation__line"
        choice={<EstimateLineChoice name={line.name} unit={line.uom.name} included={included} disabled={false}
          accessibleLabel={`Include ${line.name} in preview`} onToggle={setIncluded} />}
        tier={included ? <EstimateLineTierOptions label={line.name} groupName={`preview-tier-${line.mainLineId}`} value={tier}
          options={tierOptions} availabilityId={tierAvailabilityId} onChange={next => { setTier(next); setComponents([]); }} /> : null}
        type={included ? <div className="configured-estimate-line__readonly"><span>Type</span><strong>{classification === "special" ? "Special" : "Standard"}</strong></div> : null}
        pricing={included ? <EstimatePricingModeControl mode={mode} label={line.name} groupName={`preview-mode-${line.mainLineId}`}
          editable={classification === "special"} onTogglePmc={() => changeMode(mode === "pmc" ? nonPmcMode.current : "pmc")} onChange={changeMode} /> : null}
        fields={<>
          {line.dimensionsMandatory ? <div className="configured-estimate-line__quantity configured-estimate-line__quantity--calculated"><span>Qty ({line.uom.name})</span><output aria-label={`Quantity for ${line.name} ${line.uom.name}`}>{measured?.quantity ?? "Pending"}</output></div>
            : <label className="configured-estimate-line__quantity"><span>Qty ({line.uom.name})</span><span className="configured-estimate-line__stepper">
              <button type="button" aria-label={`Decrease quantity for ${line.name}`} disabled={!included || !Number.isFinite(quantityNumber) || quantityNumber <= 1} onClick={() => stepQuantity(-1)}>−</button>
              <input aria-label={`Quantity for ${line.name} ${line.uom.name}`} type="number" inputMode="decimal" min="0" step="any" value={quantity} disabled={!included} onChange={event => setQuantity(event.target.value)} />
              <button type="button" aria-label={`Increase quantity for ${line.name}`} disabled={!included} onClick={() => stepQuantity(1)}>+</button>
            </span></label>}
          <div className="configured-estimate-line__rate client-quotation__price"><span>Rate (₹/{line.uom.name})</span><output aria-label={`Price for ${line.name}`} className={inHouseComponents ? "client-quotation__component-rate" : undefined}>{inHouseComponents ? "From components" : money(pricing?.modeBaseRatesPaise[mode])}</output></div>
          <div className="configured-estimate-line__amount"><span>Amount</span><output aria-label={`Amount for ${line.name}`}>After save</output></div>
        </>}>
        {included ? <>
          <EstimateLineTierNotes options={tierOptions} id={tierAvailabilityId} />
          {unavailableReason ? <p className="configured-estimate-line__message" role="status">Price is unavailable for the selected mode and tier. Review the available options.</p> : null}
          {line.dimensionsMandatory ? line.dimensionRule
            ? <EstimateDimensionsFields label={line.name} dimensions={dimensions} rule={line.dimensionRule} quantityUnit={line.uom.name} onChange={setDimensions} />
            : <p className="configured-estimate-line__message" role="status">Dimensions are unavailable until the configured unit is reviewed.</p> : null}
          {inHouseComponents ? <fieldset className="client-quotation__components" aria-label={`Components for ${line.name}`}><legend>In-house components</legend>
            {inHouseComponents.map(component => {
              const available = !component.unavailableReason && component.baseRatePaise !== null && Number.isSafeInteger(component.baseRatePaise) && component.baseRatePaise >= 0;
              return <label key={component.id}><input type="checkbox" checked={components.includes(component.id)} disabled={!available}
                onChange={event => setComponents(previous => event.target.checked ? [...previous, component.id] : previous.filter(id => id !== component.id))} />
                <span className="client-quotation__component-copy"><span>{component.basketName}{component.subBasketName ? ` / ${component.subBasketName}` : ""}</span>
                  {!available ? <span className="client-quotation__component-status">(unavailable)</span> : null}</span></label>;
            })}
            {!inHouseComponents.length ? <p className="configured-estimate-line__message">No In-house components are configured.</p> : null}
          </fieldset> : null}
        </> : <p className="configured-estimate-line__message">Not included in this preview. Select the Main Line to restore its choices.</p>}
      </EstimateLineLayout>
    </div>
  </div>;
}

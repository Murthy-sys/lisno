import { useState } from "react";
import type { EstimationCatalogueBasket } from "./estimationCatalogueApi";
import { resolveMainBasketImage } from "./mainBasketImages";
import { isEstimationLinePriceVisible } from "./estimationCatalogueVisibility";

function basketCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export interface MainBasketSelectionSummary {
  id: string;
  name: string;
  subBaskets: ReadonlyArray<{ id: string; name: string; mainLineCount: number; temporaryItemCount: number }>;
  directTemporaryItemCount: number;
}

type MainBasketSelectionCardProps = ({ basket: EstimationCatalogueBasket; summary?: never } | { summary: MainBasketSelectionSummary; basket?: never }) & {
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export function MainBasketSelectionCard({ basket, summary, selected, disabled, onToggle }: MainBasketSelectionCardProps) {
  const presentation = summary ?? {
    id: basket.id,
    name: basket.name,
    subBaskets: basket.subBaskets.map((item) => ({ id: item.id, name: item.name,
      mainLineCount: item.mainLines.filter(line => isEstimationLinePriceVisible(line)).length,
      temporaryItemCount: (item.temporaryItems ?? []).filter(line => isEstimationLinePriceVisible(line)).length })),
    directTemporaryItemCount: (basket.directTemporaryItems ?? []).filter(line => isEstimationLinePriceVisible(line)).length
  };
  const [expanded, setExpanded] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = resolveMainBasketImage(presentation.name);
  const detailsId = `estimate-basket-details-${presentation.id}`;
  const headingId = `estimate-basket-heading-${presentation.id}`;
  const temporaryCount = presentation.directTemporaryItemCount + presentation.subBaskets.reduce((sum, item) => sum + item.temporaryItemCount, 0);

  return <article className={`configured-estimate-chooser__item${selected ? " configured-estimate-chooser__item--selected" : ""}`} aria-labelledby={headingId}>
    {selected ? <span className="configured-estimate-chooser__selected-mark" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 10 3 3 7-7" /></svg></span> : null}
    <div className="configured-estimate-chooser__card-row">
      <div className="configured-estimate-chooser__photo" aria-hidden="true">
        {image && failedImage !== image ? <img src={image} alt="" width="160" height="208" loading="lazy" decoding="async" onError={() => setFailedImage(image)} /> : <span className="configured-estimate-chooser__photo-placeholder" />}
      </div>
      <div className="configured-estimate-chooser__card-content">
        <header className="configured-estimate-chooser__card-heading">
          <span className="configured-estimate-chooser__glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg></span>
          <h3 id={headingId}>{presentation.name}</h3>
        </header>
        <div className="configured-estimate-chooser__actions">
          <button type="button" className="configured-estimate-chooser__selection" aria-pressed={selected} aria-label={`${selected ? "Added" : "Add"} ${presentation.name}`} disabled={disabled} onClick={onToggle}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={selected ? "m4 10 4 4 8-8" : "M10 4v12M4 10h12"} /></svg><span>{selected ? "Added" : "Add"}</span>
          </button>
          <button type="button" className="configured-estimate-chooser__disclosure" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "Show"} ${presentation.name} details`} onClick={() => setExpanded((current) => !current)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
    <div id={detailsId} className="configured-estimate-chooser__details" hidden={!expanded}>
      {presentation.subBaskets.map((subBasket) => <div key={subBasket.id} className="configured-estimate-chooser__detail"><strong>{subBasket.name}</strong><span>{basketCount(subBasket.mainLineCount, "Main Line", "Main Lines")} · {basketCount(subBasket.temporaryItemCount, "Temporary Item", "Temporary Items")}</span></div>)}
      {presentation.directTemporaryItemCount ? <div className="configured-estimate-chooser__detail"><strong>Directly under Main Basket</strong><span>{basketCount(presentation.directTemporaryItemCount, "Temporary Item", "Temporary Items")}</span></div> : null}
      {!presentation.subBaskets.length && !temporaryCount ? <p>No available items in this basket yet.</p> : null}
    </div>
  </article>;
}

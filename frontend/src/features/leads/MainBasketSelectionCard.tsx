import { useState } from "react";
import type { EstimationCatalogueBasket } from "./estimationCatalogueApi";
import { resolveMainBasketImage } from "./mainBasketImages";

function basketCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function MainBasketSelectionCard({ basket, selected, disabled, onToggle }: {
  basket: EstimationCatalogueBasket;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = resolveMainBasketImage(basket.name);
  const detailsId = `estimate-basket-details-${basket.id}`;
  const headingId = `estimate-basket-heading-${basket.id}`;
  const temporaryCount = (basket.directTemporaryItems ?? []).length + basket.subBaskets.reduce((sum, item) => sum + (item.temporaryItems ?? []).length, 0);

  return <article className={`configured-estimate-chooser__item${selected ? " configured-estimate-chooser__item--selected" : ""}`} aria-labelledby={headingId}>
    {selected ? <span className="configured-estimate-chooser__selected-mark" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 10 3 3 7-7" /></svg></span> : null}
    <div className="configured-estimate-chooser__card-row">
      <div className="configured-estimate-chooser__photo" aria-hidden="true">
        {image && failedImage !== image ? <img src={image} alt="" width="160" height="208" loading="lazy" decoding="async" onError={() => setFailedImage(image)} /> : <span className="configured-estimate-chooser__photo-placeholder" />}
      </div>
      <div className="configured-estimate-chooser__card-content">
        <header className="configured-estimate-chooser__card-heading">
          <span className="configured-estimate-chooser__glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg></span>
          <h3 id={headingId}>{basket.name}</h3>
        </header>
        <div className="configured-estimate-chooser__actions">
          <button type="button" className="configured-estimate-chooser__selection" aria-pressed={selected} aria-label={`${selected ? "Added" : "Add"} ${basket.name}`} disabled={disabled} onClick={onToggle}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={selected ? "m4 10 4 4 8-8" : "M10 4v12M4 10h12"} /></svg><span>{selected ? "Added" : "Add"}</span>
          </button>
          <button type="button" className="configured-estimate-chooser__disclosure" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "Show"} ${basket.name} details`} onClick={() => setExpanded((current) => !current)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
    <div id={detailsId} className="configured-estimate-chooser__details" hidden={!expanded}>
      {basket.subBaskets.map((subBasket) => <div key={subBasket.id} className="configured-estimate-chooser__detail"><strong>{subBasket.name}</strong><span>{basketCount(subBasket.mainLines.length, "Main Line", "Main Lines")} · {basketCount((subBasket.temporaryItems ?? []).length, "Temporary Item", "Temporary Items")}</span></div>)}
      {(basket.directTemporaryItems ?? []).length ? <div className="configured-estimate-chooser__detail"><strong>Directly under Main Basket</strong><span>{basketCount(basket.directTemporaryItems?.length ?? 0, "Temporary Item", "Temporary Items")}</span></div> : null}
      {!basket.subBaskets.length && !temporaryCount ? <p>No available items in this basket yet.</p> : null}
    </div>
  </article>;
}

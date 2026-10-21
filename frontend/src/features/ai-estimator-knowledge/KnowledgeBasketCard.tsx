import { useState, type ReactNode, type Ref } from "react";

type KnowledgeBasketCardProps = {
  variant: "main" | "sub" | "direct";
  name: string;
  panelId: string;
  imageUrl: string | null;
  countText: string;
  expanded: boolean;
  onToggle: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
  creationActions?: ReactNode;
  actions?: ReactNode;
  description?: string;
  children: ReactNode;
};

export function KnowledgeBasketCard({
  variant, name, panelId, imageUrl, countText, expanded, onToggle,
  toggleRef, creationActions, actions, description, children
}: KnowledgeBasketCardProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const headingId = `${panelId}-heading`;
  const Heading = variant === "main" ? "h2" : "h3";
  const heading = <Heading id={headingId} className="knowledge-basket-card__heading">
    <button
      ref={toggleRef}
      type="button"
      className="knowledge-basket-card__toggle"
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <span>{name}</span>
      <svg className="knowledge-basket-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </button>
  </Heading>;

  return <section
    className={`knowledge-basket-card knowledge-basket-card--${variant}`}
    aria-labelledby={headingId}
    data-expanded={expanded || undefined}
  >
    {variant === "main" ? <div className="knowledge-basket-card__header">
      <div className="knowledge-basket-card__photo" aria-hidden="true">
        {imageUrl && failedImage !== imageUrl ? <img
          src={imageUrl}
          alt=""
          width="160"
          height="208"
          loading="lazy"
          decoding="async"
          onError={() => setFailedImage(imageUrl)}
        /> : <span className="knowledge-basket-card__photo-placeholder" />}
      </div>
      <div className="knowledge-basket-card__content">
        <span className="knowledge-basket-card__kind">Main Basket</span>
        {heading}
        <p className="knowledge-basket-card__count">{countText}</p>
        {description ? <p className="knowledge-basket-card__description" hidden={!expanded}>{description}</p> : null}
      </div>
      {creationActions || actions ? <div className="knowledge-basket-card__commands">
        {creationActions ? <div className="knowledge-basket-card__creation-actions">{creationActions}</div> : null}
        {actions ? <div className="knowledge-basket-card__actions">{actions}</div> : null}
      </div> : null}
    </div> : <div className="knowledge-basket-card__header knowledge-basket-card__group-header">
      <div className="knowledge-basket-card__content">
        {variant === "sub" ? <span className="knowledge-basket-card__kind">Sub-Basket</span> : null}
        {heading}
      </div>
      <p className="knowledge-basket-card__count">{countText}</p>
      {actions ? <div className="knowledge-basket-card__actions">{actions}</div> : null}
    </div>}
    <div id={panelId} className="knowledge-basket-card__body" hidden={!expanded}>
      {children}
    </div>
  </section>;
}

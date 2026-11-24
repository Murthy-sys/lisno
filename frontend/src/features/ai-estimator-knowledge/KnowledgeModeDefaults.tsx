import { useQuery } from "@tanstack/react-query";

import type { KnowledgeSubBasketMarginRange, KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import type { KnowledgeModeConfigurationScope } from "../../../../shared/knowledge/knowledgeModeTiers";
import { Surface } from "../../components/ui/Surface";
import { componentLabel, defaultLabel, rangeText, scopeKey, scopeLabel, sharedTierDefaults } from "./knowledgeMarginFields";
import { getKnowledgeSubBasketMargins } from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeItemDetail } from "./knowledgeTypes";
import "./knowledge-mode-defaults.css";

const percentage = (value: number | null | undefined) => value == null ? "Not configured" : `${value / 100}%`;
const marginValue = (range?: KnowledgeSubBasketMarginRange) => !range || (range.minimumBps === null && range.maximumBps === null)
  ? "Not configured" : `${percentage(range.minimumBps)} - ${percentage(range.maximumBps)}`;
const componentKey = (component: KnowledgeSubBasketMarginRange["component"]) => component
  ? JSON.stringify([component.basketId, component.subBasketId]) : "legacy";
const complete = (range?: KnowledgeSubBasketMarginRange): range is KnowledgeSubBasketMarginRange => Boolean(range && range.minimumBps !== null && range.maximumBps !== null);
const equalRange = (left: KnowledgeSubBasketMarginRange, right: KnowledgeSubBasketMarginRange) => left.minimumBps === right.minimumBps && left.maximumBps === right.maximumBps;

export interface KnowledgeModeDefaultsProps {
  readonly item: KnowledgeItemDetail;
  readonly modeTier?: KnowledgeModeConfigurationScope;
}

export function KnowledgeModeDefaults({ item, modeTier = "signature" }: KnowledgeModeDefaultsProps) {
  const query = useQuery({
    queryKey: modeTier === "default" ? knowledgeQueryKeys.subBasketMargins(item.basketId, item.subBasketId ?? "", modeTier)
      : knowledgeQueryKeys.sharedSubBasketTierMargins(item.basketId, item.subBasketId ?? "", modeTier),
    queryFn: async () => {
      const saved = await getKnowledgeSubBasketMargins(item.basketId, item.subBasketId!,
        modeTier === "default" ? { modeTier } : { modeTier, inHouseScope: "sub_basket" });
      if (saved.basketId !== item.basketId || saved.subBasketId !== item.subBasketId) {
        throw new Error("Could not verify the Sub-Basket margin summary.");
      }
      if (modeTier === "default") return saved;
      const defaults = sharedTierDefaults(saved.defaults ?? [], modeTier);
      if (!defaults) throw new Error("Could not load shared margins for this tier.");
      return { ...saved, defaults };
    },
    enabled: Boolean(item.subBasketId)
  });
  const summary = item.subBasketId && !query.isError ? query.data : undefined;
  const unavailable = query.isError ? "Unavailable" : item.subBasketId && query.isPending ? "Loading…" : "Not configured";
  const hasDefaults = summary && (summary.ownedMargins || summary.source);
  const exceptions = summary?.exceptions?.filter((entry) => entry.mainLineId === item.mainLineId && entry.tier === modeTier) ?? [];
  const configured = summary?.defaults?.filter((entry) => entry.tier === modeTier);
  const modeValue = (mode: "pmc" | "sub_vendor") => hasDefaults ? marginValue(summary.modes[mode].ranges[0]) : unavailable;

  return <Surface as="section" className="knowledge-mode-defaults" data-knowledge-rail-header aria-label="Sub-basket defaults" aria-busy={query.isFetching || undefined}>
    {configured ? <dl className="knowledge-mode-defaults__list">{configured.map((entry) => <div key={scopeKey(entry)}>
      <dt>{scopeLabel(entry, configured)}</dt><dd>{entry.ranges.length
        ? <>{rangeText(entry.ranges)}<small> · {defaultLabel(entry)}</small></> : defaultLabel(entry)}</dd>
    </div>)}</dl> : <dl className="knowledge-mode-defaults__list">
      <div><dt>PMC margin:</dt><dd>{modeValue("pmc")}</dd></div>
      <div><dt>Sub-vendor margin:</dt><dd>{modeValue("sub_vendor")}</dd></div>
      <div><dt>In-house margin:</dt><dd>{hasDefaults ? <InHouseMargins summary={summary} /> : unavailable}</dd></div>
    </dl>}
    {exceptions.length > 0 && <section aria-label="Saved margin exceptions">
      <strong>Awaiting Sub-Basket review</strong><p>These saved margins apply to this Main Line.</p>
      <ul>{exceptions.map((entry) => <li key={scopeKey(entry)}>{scopeLabel(entry, configured ?? [])}
        {entry.requiresDefault && <p>Choose a shared default to compare these margins.</p>}
        {entry.proposals ? <ul>{entry.proposals.map((proposal) => <li key={scopeKey(proposal)}>
          {[componentLabel(proposal), rangeText(proposal.ranges)].filter(Boolean).join(" · ")}
        </li>)}</ul> : <>: {rangeText(entry.ranges)}</>}
      </li>)}</ul>
    </section>}
  </Surface>;
}

function InHouseMargins({ summary }: { readonly summary: KnowledgeSubBasketMarginSummary }) {
  const calculations = summary.sourceConfiguration?.modes.in_house.calculations ?? [];
  const ranges = summary.modes.in_house.ranges;
  const keys = [...new Set([...calculations.map((entry) => componentKey(entry.component)), ...ranges.map((entry) => componentKey(entry.component))])];
  const groups = keys.map((key) => {
    const margins = ranges.filter((entry) => componentKey(entry.component) === key);
    const component = calculations.find((entry) => componentKey(entry.component) === key)?.component ?? margins[0]?.component;
    const labor = margins.find((range) => range.key === "labor");
    const material = margins.find((range) => range.key === "material");
    const uniform = complete(labor) && complete(material) && equalRange(labor, material) ? labor : null;
    return { key, name: component?.name ?? "In-house component", labor, material, uniform };
  });
  if (!groups.length) return <>Not configured</>;
  const first = groups[0]!.uniform;
  if (first && groups.every((group) => group.uniform && equalRange(first, group.uniform))) return <>{marginValue(first)}</>;

  return <div className="knowledge-mode-defaults__in-house" tabIndex={groups.length > 2 ? 0 : undefined}
    role={groups.length > 2 ? "region" : undefined} aria-label={groups.length > 2 ? "In-house margin ranges" : undefined}>
    {groups.map((group) => <div className="knowledge-mode-defaults__component" key={group.key}>
      {groups.length > 1 ? <span className="knowledge-mode-defaults__component-name">{group.name}</span> : null}
      {group.uniform ? <span>{marginValue(group.uniform)}</span>
        : !group.labor && !group.material ? <span>Not configured</span>
          : <><span>Labour: {marginValue(group.labor)}</span><span>Material: {marginValue(group.material)}</span></>}
    </div>)}
  </div>;
}

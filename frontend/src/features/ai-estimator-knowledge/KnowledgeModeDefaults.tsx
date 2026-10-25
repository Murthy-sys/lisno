import { useQuery } from "@tanstack/react-query";

import type { KnowledgeSubBasketMarginRange, KnowledgeSubBasketMarginSummary } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { Surface } from "../../components/ui/Surface";
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
}

export function KnowledgeModeDefaults({ item }: KnowledgeModeDefaultsProps) {
  const query = useQuery({
    queryKey: knowledgeQueryKeys.subBasketMargins(item.basketId, item.subBasketId ?? ""),
    queryFn: () => getKnowledgeSubBasketMargins(item.basketId, item.subBasketId!),
    enabled: Boolean(item.subBasketId)
  });
  const summary = item.subBasketId && !query.isError ? query.data : undefined;
  const unavailable = query.isError ? "Unavailable" : item.subBasketId && query.isPending ? "Loading…" : "Not configured";
  const modeValue = (mode: "pmc" | "sub_vendor") => summary?.source ? marginValue(summary.modes[mode].ranges[0]) : unavailable;

  return <Surface as="section" className="knowledge-mode-defaults" data-knowledge-rail-header aria-label="Sub-basket defaults" aria-busy={query.isFetching || undefined}>
    <dl className="knowledge-mode-defaults__list">
      <div><dt>PMC margin:</dt><dd>{modeValue("pmc")}</dd></div>
      <div><dt>Sub-vendor margin:</dt><dd>{modeValue("sub_vendor")}</dd></div>
      <div><dt>In-house margin:</dt><dd>{summary?.source ? <InHouseMargins summary={summary} /> : unavailable}</dd></div>
    </dl>
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

import { useMemo } from "react";

import { Field, Input, Textarea } from "../../components/ui/Field";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import {
  KNOWLEDGE_MAX_SPECIFICATIONS,
  createKnowledgeSpecification,
  parseKnowledgeSpecifications,
  referencedSpecificationIds as referencedSpecificationIdsFromPrices,
  serializeKnowledgeSpecifications,
  type KnowledgeSpecificationConfiguration,
  type KnowledgeSpecificationIssue
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

export interface KnowledgeSpecificationBuilderProps {
  readonly value: KnowledgeJsonValue | undefined;
  readonly priceEntries: KnowledgeJsonValue | undefined;
  readonly referencedSpecificationIds?: readonly string[];
  readonly readOnly: boolean;
  readonly issues?: readonly KnowledgeSpecificationIssue[];
  readonly onChange: (value: readonly KnowledgeJsonValue[]) => void;
  readonly onDirty: () => void;
}

export function KnowledgeSpecificationBuilder({
  value,
  priceEntries,
  referencedSpecificationIds = [],
  readOnly,
  issues: suppliedIssues,
  onChange,
  onDirty
}: KnowledgeSpecificationBuilderProps) {
  const parsed = useMemo(() => parseKnowledgeSpecifications(value), [value]);
  const issues = suppliedIssues ?? parsed.issues;
  const referencedIds = useMemo(
    () => new Set([
      ...referencedSpecificationIds,
      ...referencedSpecificationIdsFromPrices(priceEntries)
    ]),
    [priceEntries, referencedSpecificationIds]
  );

  function update(next: readonly KnowledgeSpecificationConfiguration[]) {
    onDirty();
    onChange(serializeKnowledgeSpecifications(next));
  }

  function replace(index: number, next: KnowledgeSpecificationConfiguration) {
    update(parsed.specifications.map((entry, entryIndex) =>
      entryIndex === index ? next : entry
    ));
  }

  function issueFor(path: string): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  return (
    <KnowledgeRepeater
      label="Specifications"
      addLabel="Add Specification"
      items={parsed.specifications}
      readOnly={readOnly}
      addDisabled={parsed.specifications.length >= KNOWLEDGE_MAX_SPECIFICATIONS}
      emptyMessage="No Specifications configured."
      removeDisabled={(specification) => referencedIds.has(specification.id)}
      removeDisabledReason={(specification) => referencedIds.has(specification.id)
        ? "This Specification is retained by an immutable historical price version and cannot be removed."
        : undefined}
      onAdd={() => update([...parsed.specifications, createKnowledgeSpecification()])}
      onRemove={(id) => update(parsed.specifications.filter((specification) =>
        specification.id !== id
      ))}
      onMove={(id, direction) => {
        const specifications = [...parsed.specifications];
        const from = specifications.findIndex((specification) => specification.id === id);
        const to = direction === "up" ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= specifications.length) return;
        [specifications[from], specifications[to]] = [
          specifications[to]!,
          specifications[from]!
        ];
        update(specifications);
      }}
      renderItem={(specification, index) => {
        const path = `specifications.${index}`;
        const prefix = domId(specification.id);
        return (
          <div className="knowledge-mode-field knowledge-specification-field">
            <div className="knowledge-mode-field__definition">
              <Field
                id={`${prefix}-name`}
                label="Specification name"
                required
                error={issueFor(`${path}.name`)}
              >
                {(props) => (
                  <Input
                    {...props}
                    maxLength={240}
                    disabled={readOnly}
                    value={specification.name}
                    onChange={(event) => replace(index, {
                      ...specification,
                      name: event.target.value
                    })}
                  />
                )}
              </Field>
              <Field
                id={`${prefix}-description`}
                label="Brief description"
                hint="Add concise material or work-detail guidance."
                error={issueFor(`${path}.description`)}
              >
                {(props) => (
                  <Textarea
                    {...props}
                    maxLength={4_000}
                    disabled={readOnly}
                    value={specification.description ?? ""}
                    onChange={(event) => replace(index, {
                      ...specification,
                      description: event.target.value
                    })}
                  />
                )}
              </Field>
            </div>
          </div>
        );
      }}
    />
  );
}

function domId(id: string): string {
  return `knowledge-specification-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

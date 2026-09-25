import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeMaster, KnowledgeMasterType } from "../../../../shared/knowledge/knowledgeTypes";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

export interface KnowledgeEditorProps {
  readonly item: KnowledgeItemDetail;
  readonly payload: KnowledgeJsonObject;
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly readOnly: boolean;
  readonly context: KnowledgeMobileContext;
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly catalogsReady: boolean;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onValidityChange?: (valid: boolean) => void;
}

export interface KnowledgeSaveHandle {
  save(): Promise<boolean>;
  discard(): void;
}

export interface KnowledgeModeEditorProps extends KnowledgeEditorProps {
  readonly referencedSpecificationIds?: readonly string[];
  readonly overviewPayload: KnowledgeJsonObject;
  readonly pricingPayload: KnowledgeJsonObject;
  readonly onPricingChange: (payload: KnowledgeJsonObject) => void;
}

export interface KnowledgeQualityEditorProps {
  /** The item workspace supplies the shared save/discard bar. */
  readonly embedded?: boolean;
  readonly revisionId?: string;
  readonly item: KnowledgeItemDetail;
  readonly context: KnowledgeMobileContext;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
}

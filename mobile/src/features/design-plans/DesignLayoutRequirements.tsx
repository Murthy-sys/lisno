import { useRef, useState } from "react";
import { View } from "react-native";
import { DESIGN_LAYOUT_LABELS, type DesignLayoutRequirements, type DesignLayoutType } from "../../../../shared/projects/designLayoutRequirements";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles } from "../knowledge/knowledgeUi";
import { classifyDesignLayout } from "./designPlanApi";
import type { DesignUpload } from "./designPlanModel";
import { DesignCommandState, useDesignCommand, useDesignDraftGuard, useDesignOwner } from "./DesignPlanControls";

const coverageLabels = {
  missing: "missing",
  processing: "processing",
  review_pending: "uploaded; drawing review pending",
  ready: "layout content ready"
} as const;

export function RequiredLayouts({ requirements }: { readonly requirements: DesignLayoutRequirements }) {
  if (requirements.status === "not_applicable") return null;
  return <KnowledgeCard title="Required layouts">
    {requirements.status === "waiting_for_choice" ? <KnowledgeText>Waiting for the Client to choose an execution path</KnowledgeText>
      : requirements.status === "unavailable" ? <KnowledgeText error>Execution choice unavailable. Refresh designs before uploading or submitting.</KnowledgeText>
        : <>
          <KnowledgeText>{requirements.choice!.optionLabel}: {requirements.choice!.phases.map(phase => phase.label).join(" → ")}</KnowledgeText>
          {requirements.coverage.map(coverage => <KnowledgeText key={coverage.layoutType}>{DESIGN_LAYOUT_LABELS[coverage.layoutType]} {coverageLabels[coverage.state]}</KnowledgeText>)}
          <KnowledgeText>Each file has one layout type. Drawing checks and full PDF preparation must also finish before submission.</KnowledgeText>
        </>}
    {requirements.blockingReasons.map(reason => <KnowledgeText key={reason}>{reason}</KnowledgeText>)}
  </KnowledgeCard>;
}

export function ClassifyLayoutDialog({ estimateId, session, upload, requirements, disabled, onChanged, onDenied, onClose }: {
  readonly estimateId: string;
  readonly session: AuthenticatedSession;
  readonly upload: DesignUpload;
  readonly requirements: DesignLayoutRequirements;
  readonly disabled: boolean;
  readonly onChanged: () => Promise<unknown>;
  readonly onDenied: () => void;
  readonly onClose: () => void;
}) {
  const owner = useDesignOwner(estimateId, session);
  const command = useDesignCommand(owner, onChanged, onDenied);
  const [layoutType, setLayoutType] = useState<DesignLayoutType | null>(null);
  const [source] = useState({ version: requirements.designPlanVersion, revisionKey: requirements.revisionKey });
  const key = useRef(createIdempotencyKey());
  useDesignDraftGuard(layoutType !== null);
  const stale = requirements.status !== "selected" || requirements.designPlanVersion !== source.version || requirements.revisionKey !== source.revisionKey || !upload.canClassifyLayoutType || Boolean(upload.layoutType);
  const locked = disabled || stale || command.busy || command.blocked;
  return <KnowledgeModal title="Set layout type" busy={command.busy || command.blocked} onClose={onClose}>
    <KnowledgeText>{upload.originalFilename}</KnowledgeText>
    <KnowledgeText>Choose the layout shown in this file. Once saved, its layout type cannot be changed. The original file and drawings are retained.</KnowledgeText>
    <View style={knowledgeStyles.stack}>{requirements.allowedTypes.map(type => <KnowledgeChoice key={type} label={DESIGN_LAYOUT_LABELS[type]} selected={layoutType === type} disabled={locked} onPress={() => setLayoutType(type)} />)}</View>
    {stale ? <KnowledgeText error>The saved design changed. Refresh and reopen this file before labeling it.</KnowledgeText> : null}
    <DesignCommandState command={command} onRefresh={async () => { await onChanged(); onClose(); }} />
    <Button label="Confirm permanent layout type" disabled={locked || layoutType === null || !requirements.allowedTypes.includes(layoutType)} loading={command.busy} onPress={() => {
      if (layoutType === null || locked) return;
      const input = { layoutType, expectedDesignPlanVersion: source.version, idempotencyKey: key.current };
      void command.run(() => classifyDesignLayout(owner.context.runtime, estimateId, upload.id, input), { replaySafe: true, after: onClose });
    }} />
  </KnowledgeModal>;
}

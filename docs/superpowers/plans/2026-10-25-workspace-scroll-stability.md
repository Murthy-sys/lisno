# Workspace scroll stability plan

Implementation, automated verification and guarded delivery complete.

1. Audited Overview focus/scroll effects and workspace geometry. Independent read-only reviews identified the rail self-sizing feedback dependency.
2. Extracted the existing rail into KnowledgeWorkspaceRail.tsx and changed its budget to stable viewport, sticky inset and header dimensions. Preserved all previous WorkspacePage changes.
3. Added ten rendered regression cases covering parent-size feedback, viewport/header responsiveness, computed inset, stacked/tall fallback, tab changes and cleanup.
4. Validation: 45 rail/summary/status checks and two focused temporary Overview/navigation checks pass. Frontend TypeScript and production build pass. One pre-existing Screens test fails before navigation because it expects the previous inline Specification editor. Final implementation review found no actionable issues.
5. Prepared an isolated baseline/fixed browser fixture using real workspace components and CSS. Browser validation was interrupted by concurrent user activity in Chrome; no natural runtime oscillation or visual stability claim is made. The fixture remains outside the delivery. Deterministic tests verify that self-size changes cannot schedule another parent measurement. Both control cases fail against the original component and pass against the fixed component.
6. Applied and byte-verified only the five reviewed component, integration, test and documentation files with original-file hash checks and backups. Original-project diff hygiene passed. No commit, deployment or data mutation. Temporary QA server stopped.

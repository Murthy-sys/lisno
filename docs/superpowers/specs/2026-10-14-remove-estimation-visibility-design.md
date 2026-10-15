# Remove Estimation visibility from Design

User requests removal of the pictured Internal/External Estimation visibility section. Standing autonomous execution instruction applies; no further approval gate is needed.

Current evidence: `KnowledgeItemWorkspacePage.tsx` mounts the visibility editor above Design rules and coordinates its dirty/save/unknown-outcome state with the questionnaire.

Scope: remove that editor from the Design tab and remove its workspace state/ref/navigation plumbing. Keep all fourteen Design questions and their independent save, discard, pending and uncertain-result protections. This is a UI removal; existing stored visibility values, backend client confidentiality and quotation behavior remain unchanged. No data migration, dependencies or unrelated refactor.

Acceptance: visibility heading, radios and save action no longer appear; Design questions load and save; dirty navigation and in-flight/uncertain-save safeguards still work; read-only/no-revision states and adjacent tab remain usable.

Risk: accidentally removing shared navigation protection. Verify the rendered workspace and focused Design tests plus TypeScript/build. Existing dirty files must be preserved; baseline captured in `/tmp/lisno-remove-visibility/`.

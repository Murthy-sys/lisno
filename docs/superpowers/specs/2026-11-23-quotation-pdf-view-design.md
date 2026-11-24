# View quotation PDFs after saving and submitting

## Goal and current behavior

Sales and Client users need to open a quotation PDF from their estimation workspace after a successful draft save and after submission. Sales has a current-estimate PDF endpoint and a revision download. The Client submitted view offers a download tied to a review round. Its endpoint requires a round ID, which a working draft may lack.

## Interaction and scope

- Provide a **View quotation PDF** action beside the saved draft or submitted quotation for each authorized role. Assume viewing is optional after save or submit and the editor stays open until the user chooses the action.
- For a draft, preview the last successfully saved version available to that actor. Identify it as a draft. If there are unsaved edits, make clear which version the preview represents. An unsuccessful save must never be presented as a new saved version.
- For a submission, open the customer-facing PDF belonging to that specific submitted revision or review round, including when the working draft has since changed.
- Support desktop and mobile viewing, keyboard access, a way back to the estimate and a download fallback when inline viewing is unavailable. Explain incomplete pricing, stale versions, loading and retrieval failures in context.

## Data, authorization and verification

Use the existing quotation calculations and customer PDF presentation, including tax-inclusive payable amounts and internal margin confidentiality. Client access follows existing project membership and draft visibility. A preview must not publish a draft, send a notification or alter approval history. Reuse authenticated PDF delivery and existing renderers where their access and version contracts match.

Verify Sales and Client draft saves, both submission flows, a revised draft after submission, a failed save, and an unrelated user's denied request. Check PDF content and version identity, including hidden rows and private pricing. No migration is expected. The plan should identify the authorized draft source and submitted artifact for each workflow before choosing endpoints.

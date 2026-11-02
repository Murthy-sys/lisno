import { writeFile } from "node:fs/promises";
import { renderEstimateProposalPdf } from "../../src/services/estimate-proposal-pdf/index.js";
import { proposalFixture } from "./estimate-proposal.js";
await writeFile(process.argv[2] || "/tmp/lisno-estimate-pdf-reference-qa/proposal-preview.pdf", await renderEstimateProposalPdf(proposalFixture()));

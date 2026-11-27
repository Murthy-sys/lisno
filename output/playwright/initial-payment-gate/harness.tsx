import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ProcurementEstimateSource } from '../../../frontend/src/features/procurement/ProcurementEstimateSource';
import { ProjectInitialPaymentStatus } from '../../../frontend/src/features/finance/DesignPaymentConfirmations';
import '../../../frontend/src/styles/global.css';
import '../../../frontend/src/styles/base.css';
import '../../../frontend/src/styles/primitives.css';
import '../procurement-lifecycle/harness.css';
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'missing';
const version = scenario === 'legacy' ? undefined : 3;
const writes: unknown[] = [];
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.includes('/api/')) return originalFetch(input, init);
  if (init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ data: { version: 5 } }), { headers: { 'Content-Type': 'application/json' } }); }
  throw new Error('Unexpected synthetic API read: ' + url);
};
(window as any).__qa = { writes, scenario };
const payment = { confirmedAt: null, version: 4, workflowVersion: version, status: scenario === 'blocked' ? 'awaiting_estimate_approval' : 'awaiting_payment', canConfirm: scenario !== 'blocked', ...(scenario === 'stale' ? { requiresAttestation: true, existingReceiptAt: '2026-11-01T09:00:00.000Z' } : {}) };
const workflow = { projectId: 'synthetic-project', projectName: 'Sample project', serverNow: '2026-11-28T09:00:00.000Z', floors: [], initialPayment: payment };
const readiness = { required: true, canIssue: scenario !== 'blocked', blockers: scenario === 'blocked' ? ['Client approval of the current quotation is required.'] : [], finalSource: { estimateId: 'synthetic-estimate', estimateVersion: 4, estimateReviewRoundId: 'synthetic-round' } };
const source = { workflowVersion: 3, kind: 'approved_final', estimateVersion: 4 };
function Harness() { return <main><header><span className="eyebrow">Synthetic component QA</span><h1>Sample project</h1></header><nav aria-label="QA scenarios" style={{display:'flex',flexWrap:'wrap',gap:16,marginBlock:24}}>{['missing','stale','blocked','finance','legacy'].map(item => <a key={item} href={'/?scenario='+item}>{item}</a>)}</nav><div style={{display:'grid',gap:24}}>{version ? <ProcurementEstimateSource source={source as any} readiness={readiness} /> : null}<ProjectInitialPaymentStatus workflow={workflow as any} /></div></main>; }
const qaRoot = (window as any).__qaRoot ??= createRoot(document.getElementById('root')!);
qaRoot.render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><BrowserRouter><Harness/></BrowserRouter></QueryClientProvider>);

// SPDX-License-Identifier: MIT
// Optional offline inbox receipt reconciliation. No Gmail credentials are stored or accessed.
// User supplies a JSON manifest with exact job URLs and email evidence; no fuzzy matching.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLog, applicationHistory, ensureLog, readLog } from './log.js';
import { validateReceipt } from './receipt-validation.js';
import { ledgerPath, updateLedger } from './submission-ledger.js';
import { normalizeUrl } from './discover.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const logPath=path.join(root,'data','application-log.csv');
ensureLog(logPath);
const [command, file]=process.argv.slice(2);
if (command !== 'receipts' || !file) {
  console.log('Usage: node src/reconcile.js receipts path/to/receipts.json');
  console.log('Use an exact original job URL and a specific application-received email. See receipts.example.json.');
  process.exit(1);
}
const receipts=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
if (!Array.isArray(receipts)) throw new Error('Receipt manifest must be a JSON array');
const history=applicationHistory(logPath);
const priorRows=readLog(logPath);
let accepted=0, rejected=0;
for (const receipt of receipts) {
  const {url,from,subject,receivedAt,bodySnippet}=receipt;
  const k=normalizeUrl(url,url);
  const previous=history.get(k);
  const evidence=validateReceipt(receipt,priorRows.filter(r=>normalizeUrl(r.url,r.url)===k));
  if (!previous || !evidence.ok) {
    console.warn(`Needs manual review: ${url||'(missing URL)'} — ${evidence.reason}`);rejected++;continue;
  }
  if (priorRows.some(r=>normalizeUrl(r.url,r.url)===k && r.status==='submitted-email-confirmed')) { console.log(`Email confirmation already recorded: ${url}`);continue; }
  const evidenceDir=path.join(root,'outbox','verification');
  fs.mkdirSync(evidenceDir,{recursive:true});
  const evidenceFile=`email-receipt-${Date.now()}-${accepted}.json`;
  fs.writeFileSync(path.join(evidenceDir,evidenceFile),JSON.stringify({url,from,subject,receivedAt,bodySnippet},null,2));
  appendLog(logPath,{timestamp:new Date().toISOString(),url,source:'email-receipt-reconciliation',
    status:'submitted-email-confirmed',submission_verified:'yes',
    verification_evidence:`Email: ${subject} from ${from} at ${receivedAt}`,
    artifact_path:path.join('verification',evidenceFile)});
  updateLedger(ledgerPath(root),url,'submitted-email-confirmed',{evidenceFile});
  console.log(`Reconciled from supplied receipt: ${url}`);accepted++;
}
console.log(`Receipt reconciliation: ${accepted} confirmed, ${rejected} rejected/unmatched`);

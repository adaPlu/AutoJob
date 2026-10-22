// Explicit manual unlock only after the person verified the ATS did NOT receive the application.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLog } from './log.js';
import { ledgerPath,updateLedger } from './submission-ledger.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [url,...reasonParts]=process.argv.slice(2);
const reason=reasonParts.join(' ').trim();
if (!url || !reason || !/^https?:\/\//i.test(url)) {
  console.error('Usage: node src/resolve.js "EXACT_JOB_URL" "Evidence checked on ATS: not submitted"');
  process.exit(1);
}
appendLog(path.join(root,'data','application-log.csv'),{
  timestamp:new Date().toISOString(),url,status:'manual-confirmed-not-submitted',
  submission_verified:'no',verification_evidence:reason,blocker:'Manual clearance for retry'
});
updateLedger(ledgerPath(root),url,'manual-confirmed-not-submitted',{manualReason:reason});
console.log('Manual clearance recorded. The job can be retried; check for an existing application first.');

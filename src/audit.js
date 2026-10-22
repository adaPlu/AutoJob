// Offline diagnostic replay for CSV logs. No website, Chrome or live application touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLog } from './log.js';
import { isJobUrl, normalizeUrl } from './discover.js';
import { plausibleRoleTitle } from './eligibility.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'data','application-log.csv');
if(!fs.existsSync(file)) {console.error(`Log not found: ${file}`);process.exit(1);}
const rows=readLog(file),statuses={},sources={},badExamples=[];
let badUrl=0,offTargetTitle=0,attempts=0,confirmed=0;
for(const r of rows) {
  statuses[r.status]=(statuses[r.status]||0)+1;
  sources[r.source]=(sources[r.source]||0)+1;
  if(!isJobUrl(normalizeUrl(r.url,r.url),r.source)) {badUrl++;if(badExamples.length<12) badExamples.push({reason:'not-individual-job',source:r.source,url:r.url,title:r.title});}
  if(!plausibleRoleTitle(r.title)) offTargetTitle++;
  if(['submitted-confirmed','submitted-verified'].includes(r.status)) confirmed++;
  if(['submitted-confirmed','submitted-verified','submitted-pending-receipt','submit-clicked-unverified','submission-failed'].includes(r.status)) attempts++;
}
const report={kind:'offline-log-audit',note:'Historical CSV inspection only; no live application was submitted by this audit.',file,rows:rows.length,confirmed,submitAttemptsRecorded:attempts,invalidOrListingUrls:badUrl,offTargetOrGenericTitles:offTargetTitle,statuses,sources,badExamples};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--save')) {fs.mkdirSync(path.join(root,'outbox'),{recursive:true});fs.writeFileSync(path.join(root,'outbox','audit-report.json'),JSON.stringify(report,null,2));}

// SPDX-License-Identifier: MIT
// Local report: never conflates opened listings, clicked buttons, and employer receipts.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLog} from './log.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const log=path.join(root,'data','application-log.csv');
const summary=path.join(root,'outbox','last-run-summary.json');
const rows=readLog(log);
const gmailReportPath=path.join(root,'outbox','gmail-verification-summary.json');
const gmailReport=fs.existsSync(gmailReportPath)?JSON.parse(fs.readFileSync(gmailReportPath,'utf8')):null;
const verifiedUrls=new Set(rows.filter(r=>r.status==='submitted-email-confirmed').map(r=>r.url));
const parsed=fs.existsSync(summary)?JSON.parse(fs.readFileSync(summary,'utf8')):null;
const statuses={};for(const r of rows)statuses[r.status]=(statuses[r.status]||0)+1;
console.log('\n=========== APPLICATION EVIDENCE ===========');
console.log(`Total historical log rows: ${rows.length}`);
console.log(`Latest run: ${parsed?.createdAt||'No run summary available'}`);
if(parsed?.kind==='startup-failed') {
  console.log(`CHROME STARTUP FAILED: ${parsed.startupError||'Could not open a search tab'}`);
  console.log('No jobs were searched or submitted in this run. Existing historical rows were preserved.');
}
if(parsed){console.log(`Postings inspected: ${parsed.jobsProcessed||0}${parsed.postingsInspectionLimit?` / ${parsed.postingsInspectionLimit}`:''}`);console.log(`Application workflows started: ${parsed.applicationAttempts??'not tracked in older runs'}`);console.log(`Job-specific cover letters generated: ${parsed.coverLettersGenerated??'not tracked in older runs'}`);console.log(`Simplify Autofill clicks: ${parsed.simplifyClicks||0} across ${parsed.simplifyUsed||0} jobs (not submission receipts)`);console.log(`Candidate links found (not applications): ${Number(parsed.feedLinks||0)+Number(parsed.browserLinks||0)}`);console.log(`Browser-confirmed submissions: ${parsed.confirmed||0}`);console.log(`Browser success but needs independent proof: ${parsed.pendingReceipt||0}`);console.log(`Submit clicked, unverified: ${parsed.unverified||0}`);console.log(`Gmail receipt check: ${gmailReport?.status||'not run'}`);console.log(`Email-confirmed SUCCESSFUL submissions: ${verifiedUrls.size}`);console.log(`Stalled items skipped by watchdog: ${parsed.watchdogTimeoutCount||0}`);}
if(parsed){
  console.log('\n----- PER-SITE AUTOMATION -----');
  const enabled=parsed.loginStage?.autoEnabledSources||[];
  const blocked=parsed.loginStage?.blockedSources||[];
  console.log(`Automatic search permitted on: ${enabled.join(', ')||'(login stage disabled or no saved information)'}`);
  console.log(`Paused pending sign-in or challenge: ${blocked.join(', ')||'none'}`);
  const counts=parsed.browserSearchesBySource||{};
  const attempts=parsed.applicationAttemptsBySource||{};
  const sites=new Set([...enabled,...Object.keys(counts),...Object.keys(attempts),...blocked]);
  for(const site of sites){
    console.log(`  ${site}: ${counts[site]||0} searches; ${attempts[site]||0} application attempts${blocked.includes(site)?' [PAUSED]':''}`);
  }
  console.log('Note: 0 attempts can mean no matching eligible job links, not necessarily that a site was disabled.');
}
console.log('\nHistorical statuses:',JSON.stringify(statuses,null,2));
console.log('\nOnly positive Gmail employer/ATS receipts uniquely matched to logged applications are counted as email-confirmed successes. No receipt does not prove a submission failed.');
console.log('============================================\n');

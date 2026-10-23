// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverFromSource, normalizeUrl, SOURCE_DEFS } from './discover.js';
import { discoverFromFeed } from './feeds.js';
import { buildDiscoveryPlan } from './discovery-plan.js';
import { processJob } from './apply.js';
import { appendLog, ensureLog, applicationHistory, shouldSkipJob } from './log.js';
import { ledgerPath, readLedger, updateLedger } from './submission-ledger.js';
import { runWithWatchdog, watchdogTimeoutMs, settleWithin } from './watchdog.js';
import { loadJson, resolveFromRoot } from './profile.js';
import { inspectConfiguration, requirePreflight } from './preflight.js';
import { runPreLogin } from './prelogin.js';
import { verifyGmailReceipts } from './gmail-verification.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const BUNDLE_VERSION='1.5.3';
const flags=new Set(process.argv.slice(2).filter(x=>x.startsWith('--')));
const dryRun=flags.has('--dry-run');
const onlyPreflight=flags.has('--preflight');
const onlyPlan=flags.has('--plan');
const onlyPlanSummary=flags.has('--plan-summary');
const onlyPreLogin=flags.has('--prelogin-only');
const configArg=process.argv.slice(2).find(x=>!x.startsWith('--'));
const configPath=configArg?path.resolve(configArg):path.join(root,'config.json');
if(!fs.existsSync(configPath)){console.error('Missing config.json. Copy config.example.json and complete required settings.');process.exit(1);}
console.log(`\nJob Application Automator v${BUNDLE_VERSION}`);
console.log(`Program directory: ${root}`);
console.log(`Configuration file: ${configPath}`);
const config=loadJson(configPath);
if (config._bundleVersion !== BUNDLE_VERSION) {
  console.error(`WRONG CONFIGURATION: Expected v${BUNDLE_VERSION}, found ${config._bundleVersion || 'an older version'}.`);
  console.error('Use the config.json included in the new extracted folder. Do not overwrite it with an older file.');
  process.exit(1);
}
const profilePath=resolveFromRoot(root,config.profileFile||'profile.json');
if(!fs.existsSync(profilePath)){console.error(`Missing applicant profile: ${profilePath}`);process.exit(1);}
const profile=loadJson(profilePath);
const resumePath=config.resumePath?resolveFromRoot(root,config.resumePath):'';
console.log(`Applicant profile: ${profilePath}`);
console.log(`Resume file: ${resumePath || '(not configured)'}`);
try{requirePreflight(inspectConfiguration(config,profile,resumePath,{dryRun}));}
catch(error){console.error(error.message);process.exit(1);}
// --preflight only validates setup; do not require Chrome to be running for this command.
if (onlyPreflight) { console.log('PRE-FLIGHT PASSED. Use START_ALL.bat to run the full workflow.'); process.exit(0); }
if (onlyPlan || onlyPlanSummary) {
  const plan=buildDiscoveryPlan(config);
  if (onlyPlanSummary) {
    const distribution=Object.fromEntries([...new Set(plan.browserTasks.map(x=>x.source))].map(source=>[source,plan.browserTasks.filter(x=>x.source===source).length]));
    console.log(JSON.stringify({requestedSearchBudget:plan.searchBudget,plannedBrowserSearches:plan.browserTasks.length,configuredSources:plan.sourceCount,feedSources:plan.feeds.map(x=>x.source),browserSearchesBySource:distribution,maxApplicationAttempts:config.maxJobsPerRun,searchesAreMaximumNotGuaranteed:true},null,2));
  } else console.log(JSON.stringify(plan,null,2));
  process.exit(0);
}

let browser,context;
try{const { connectChrome } = await import('./browser.js'); ({browser,context}=await connectChrome(config.chromeCdpUrl||'http://127.0.0.1:9222'));}
catch(error){console.error('Cannot connect to Chrome. Run START_CHROME.bat first:',error?.message||error);process.exit(1);}

let loginStage;
try {
  loginStage=await runPreLogin({context,config,root});
  if(!loginStage.proceed){await browser.close().catch(()=>{});process.exit(2);}
} catch(error) {
  console.error(`PRE-LOGIN FAILED: ${error.message||error}`);
  await browser.close().catch(()=>{});
  process.exit(2);
}
if(onlyPreLogin){
  console.log('PRE-LOGIN CHECK COMPLETE. Your Chrome login profile is saved locally.');
  await browser.close().catch(()=>{});
  process.exit(0);
}
const blockedSources=new Set(loginStage.blockedSources||[]);
const runConfig=dryRun?{...config,autoSubmit:false}:config;
const logPath=path.join(root,'data','application-log.csv');
const outboxDir=path.join(root,'outbox');
const ledgerFile=ledgerPath(root);
ensureLog(logPath);
let processed=0, discovered=0, searches=0, feedsLoaded=0, feedLinks=0, browserLinks=0, simplifyClicks=0, simplifyStartClicks=0, simplifyUsed=0, timeouts=0;
const skippedReasons={};
const counts={confirmed:0,pendingReceipt:0,unverified:0,failed:0,blocked:0,readyNoSubmit:0,ready:0,needsReview:0,timedOut:0,errors:0,alreadyApplied:0,invalidJob:0,loginRequired:0,other:0};
const recordSkip=r=>{skippedReasons[r]=(skippedReasons[r]||0)+1;};
const maxJobs=Math.max(1,Number(config.maxJobsPerRun)||25);
const watchdogMs=watchdogTimeoutMs(config);
console.log(`Per-item inactivity watchdog: ${Math.floor(watchdogMs / 60000)} minute(s).`);
const discoveryPlan=buildDiscoveryPlan(config);
const maxSearches=discoveryPlan.searchBudget;
console.log(`Discovery plan: ${discoveryPlan.browserTasks.length} planned browser searches across ${discoveryPlan.sourceCount} configured sources; stop after ${maxJobs} application attempts.`);
const maxSourceJobs=Math.max(1,Number(config.maxJobsPerSource)||12);
const sourceCounts=new Map();
const browserSearchesBySource={};
const applicationAttemptsBySource={};
const candidatesBySource={};
const seen=new Set();
const history=applicationHistory(logPath);
const ledger=readLedger(ledgerFile);
const maxAttempts=Math.max(1,Number(config.maxJobAttempts)||3);
let searchPage=await context.newPage();
searchPage.setDefaultTimeout(8500);

async function attempt(job){
  const url=normalizeUrl(job.url,job.url);
  if(!url || seen.has(url) || processed>=maxJobs) return false;
  if(blockedSources.has(job.source)){recordSkip(`prelogin-${job.source}-needs-signin`);return false;}
  seen.add(url);
  const previous=shouldSkipJob(url,history,ledger,maxAttempts);
  if(previous){recordSkip(previous);return false;}
  // No title-only keyword score gate: candidates often have only "Software Engineer" as link text.
  // Evaluate actual skills and remote eligibility after opening the complete posting.
  discovered++;
  console.log(`\n[${processed+1}/${maxJobs}] Opening application: ${url}`);
  let result;
  try {
    const openedPages = new Set();
    const outcome=await runWithWatchdog({
      label:`application ${url}`, timeoutMs:watchdogMs,
      task:({signal,progress})=>processJob({context,job:{...job,url},config:runConfig,profile,resumePath,outboxDir,fitScore:0,ledgerFile,signal,progress,registerPage:p=>{openedPages.add(p);if(signal.aborted)p.close({runBeforeUnload:false}).catch(()=>{});}}),
      onTimeout:()=>Promise.allSettled([...openedPages].map(p=>p.close({runBeforeUnload:false})))
    });
    if (outcome.timedOut) {
      timeouts++;
      // If Submit was already clicked, do not treat it as an ordinary retryable timeout.
      const entry=readLedger(ledgerFile).get(url);
      const uncertain=['submit-attempted','submit-clicked-unverified','submitted-pending-receipt'].includes(entry?.state);
      if (uncertain) updateLedger(ledgerFile,url,'submit-clicked-unverified',{error:'Watchdog timeout after submission began; verify manually before retrying'});
      result={timestamp:new Date().toISOString(),url,source:job.source||'',status:uncertain?'submit-clicked-unverified':'timed-out',
        blocker:uncertain?'Watchdog: 5 minutes without progress after a possible submission; do not retry without verification.':'Watchdog: 5 minutes without progress; page closed and run continued.',
        title:job.anchorText||'',company:'',fit_score:0,watchdogTimeout:true};
    } else if (outcome.error) throw outcome.error;
    else result=outcome.value;
  }
  catch(error){
    result={timestamp:new Date().toISOString(),url,source:job.source||'',status:'error',blocker:String(error?.message||error),title:job.anchorText||'',company:'',fit_score:0};
  }
  appendLog(logPath,result);
  simplifyClicks += Number(result.simplifyClicks || 0);
  simplifyStartClicks += Number(result.simplifyStartClicks || 0);
  if (Number(result.simplifyClicks || 0)>0 || Number(result.simplifyStartClicks || 0)>0) simplifyUsed++;
  // Keep per-run dedup + uncertainty in sync without reparsing the CSV per job.
  if (['submitted-confirmed','already-applied'].includes(result.status)) history.set(url,{last:result.status,permanent:true});
  if (['submitted-pending-receipt','submit-clicked-unverified'].includes(result.status)) history.set(url,{last:result.status,uncertain:true});
  processed++;
  applicationAttemptsBySource[job.source||'unknown']=(applicationAttemptsBySource[job.source||'unknown']||0)+1;
  switch(result.status){
    case 'submitted-confirmed':counts.confirmed++;break;
    case 'submitted-pending-receipt':counts.pendingReceipt++;break;
    case 'submit-clicked-unverified':counts.unverified++;break;
    case 'submission-failed':counts.failed++;break;
    case 'blocked':counts.blocked++;break;
    case 'ready-no-submit-button':counts.readyNoSubmit++;break;
    case 'ready-for-submit':counts.ready++;break;
    case 'needs-review':counts.needsReview++;break;
    case 'already-applied':counts.alreadyApplied++;break;
    case 'skipped-not-individual-job':counts.invalidJob++;break;
    case 'authentication-required':counts.loginRequired++;break;
    case 'timed-out':counts.timedOut++;break;
    case 'error':counts.errors++;break;
    default:counts.other++;break;
  }
  console.log(`RESULT ${result.status}: ${result.title||job.anchorText||url}`);
  if(result.blocker) console.log(`  Reason: ${result.blocker}`);
  if(result.artifact_path) console.log(`  Screenshot/HTML: outbox/${result.artifact_path}`);
  return true;
}

function sourceFor(url){
  try{
    const host=new URL(url).hostname;
    for(const [name,def] of Object.entries(SOURCE_DEFS)){
      if((def.hosts||[]).some(h=>host===h||host.endsWith(`.${h}`))) return name;
    }
  }catch{}
  return 'companycareers';
}

try {
  for(const raw of config.jobUrls||[]){
    if(processed>=maxJobs)break;
    const url=typeof raw==='string'?raw:raw.url;
    if(!url) continue;
    await attempt({url,source:typeof raw==='object' && raw.source?raw.source:sourceFor(url),query:'direct link',anchorText:typeof raw==='object'?raw.title||'':''});
  }
  // Public, structured feeds are first: fewer brittle search result pages.
  // Search engines/site-specific pages remain useful fallback sources.
  for(const jobBatch of discoveryPlan.feeds){
    if(processed>=maxJobs)break;
    try{
      console.log(`\nFetching ${jobBatch.source} remote listings (public API)...`);
      const outcome=await runWithWatchdog({label:`feed ${jobBatch.source}`,timeoutMs:watchdogMs,
        task:({signal})=>discoverFromFeed(jobBatch.source,config,Number(config.maxFeedCandidates)||100,{signal})});
      if(outcome.timedOut){timeouts++;recordSkip(`feed-${jobBatch.source}-timeout`);continue;}
      if(outcome.error)throw outcome.error;
      const found=outcome.value;
      feedsLoaded++;feedLinks+=found.length;
      candidatesBySource[jobBatch.source]=(candidatesBySource[jobBatch.source]||0)+found.length;
      console.log(`  ${found.length} filtered listings in feed`);
      let sourceCount=0;
      for(const job of found){
        if(processed>=maxJobs || sourceCount>=maxSourceJobs) break;
        if(await attempt(job))sourceCount++;
      }
      sourceCounts.set(jobBatch.source,sourceCount);
    }catch(error){
      console.warn(`  Feed unavailable: ${String(error.message||error).slice(0,200)}. Other sources will continue.`);
    }
  }
  // Fair round-robin: every enabled site gets a turn before any site consumes a second query.
  for(const task of discoveryPlan.browserTasks){
    if(processed>=maxJobs)break;
    const source=task.source,query=task.query;
    if(blockedSources.has(source)){recordSkip(`prelogin-${source}-needs-signin`);continue;}
    let sourceCount=sourceCounts.get(source)||0;
    if(sourceCount>=maxSourceJobs)continue;
    searches++;
    browserSearchesBySource[source]=(browserSearchesBySource[source]||0)+1;
    console.log(`\nSearching ${source}: ${query} (${searches}/${maxSearches})`);
    let found=[];
    try {
      const pageForSearch=searchPage;
      const outcome=await runWithWatchdog({label:`search ${source}: ${query}`,timeoutMs:watchdogMs,
        task:({signal,progress})=>discoverFromSource(pageForSearch,source,query,Math.min(30,maxSourceJobs-sourceCount),Math.max(1,Number(config.maxPagesPerSearch)||2),config,{signal,progress}),
        onTimeout:()=>pageForSearch.close({runBeforeUnload:false})});
      if(outcome.timedOut){
        timeouts++;recordSkip(`search-${source}-timeout`);
        const reset=await runWithWatchdog({label:'restore browser search tab',timeoutMs:watchdogMs,
          task:({signal})=>context.newPage().then(page=>{if(signal.aborted){page.close().catch(()=>{});throw signal.reason;}return page;})});
        if(reset.timedOut || reset.error){
          console.error('Browser stopped responding while restoring the search tab; ending the run cleanly.');
          break;
        }
        searchPage=reset.value;searchPage.setDefaultTimeout(8500);
        console.warn(`  Search stalled; moved to the next configured search/site.`);
        continue;
      }
      if(outcome.error)throw outcome.error;
      found=outcome.value;
    } catch(error){console.warn(`  Search failed: ${String(error.message||error).slice(0,180)}`);}
    browserLinks+=found.length;
    candidatesBySource[source]=(candidatesBySource[source]||0)+found.length;
    console.log(`  ${found.length} candidate link(s) found.`);
    for(const job of found){
      if(processed>=maxJobs||sourceCount>=maxSourceJobs)break;
      const attempted=await attempt(job);
      if(attempted)sourceCount++;
    }
    sourceCounts.set(source,sourceCount);
  }
} finally {
  await settleWithin(searchPage.close().catch(()=>{}),5000);
  await settleWithin(browser.close().catch(()=>{}),5000);
  let gmailSummary={status:'disabled',totalEmailConfirmed:0,newlyEmailConfirmed:0};
  if(config.gmailVerification?.enabled!==false && !dryRun){
    try{
      const check=await runWithWatchdog({label:'Gmail receipt check',timeoutMs:watchdogMs,
        task:({signal})=>verifyGmailReceipts({root,signal,maxMessages:Math.max(1,Math.min(500,Number(config.gmailVerification?.maxMessagesPerAccount)||200))})});
      gmailSummary=check.timedOut?{status:'check-timeout',errors:['Gmail check exceeded the five-minute timeout']}:
        check.error?{status:'check-error',errors:[check.error.message||String(check.error)]}:check.value;
    }catch(error){gmailSummary={status:'check-error',errors:[String(error.message||error)]};}
  }
  fs.mkdirSync(outboxDir,{recursive:true});
  fs.writeFileSync(path.join(outboxDir,'gmail-verification-summary.json'),JSON.stringify(gmailSummary,null,2));
  const summary={watchdogTimeoutMs:watchdogMs,watchdogTimeoutCount:timeouts,createdAt:new Date().toISOString(),kind:dryRun?'dry-run':'live-attempt',jobsProcessed:processed,candidatesOpened:discovered,searches,searchBudget:maxSearches,plannedBrowserSearches:discoveryPlan.browserTasks.length,feedsLoaded,feedLinks,browserLinks,simplifyClicks,simplifyStartClicks,simplifyUsed,loginStage:{enabled:loginStage.enabled!==false,manualAcknowledgment:loginStage.enabled!==false,sitesOpened:loginStage.report?.siteCount||0,blockedSources:[...blockedSources],autoEnabledSources:loginStage.report?.autoEnabled||[],reportFile:loginStage.report?path.join(root,'data','prelogin-status.json'):null},discoverySources:discoveryPlan.sourceCount,browserSearchesBySource,applicationAttemptsBySource,candidatesBySource,...counts,skippedReasons,
    statusDefinitions:{confirmed:'Browser evidence only; NOT included in successful email-confirmed count',pendingReceipt:'Browser success observed; email receipt pending',unverified:'Submit was clicked; status uncertain—do not retry automatically',emailConfirmed:'Unique job and employer matched to an affirmative Gmail acknowledgement'},
    gmailVerification:gmailSummary,
    actualEmployerEmailConfirmations:gmailSummary.totalEmailConfirmed??null,
    actualEmployerEmailConfirmationsExplanation:'Only unique positive Gmail-confirmed job receipts count as successful submissions; missing receipts remain unconfirmed.',
    logPath,ledgerFile,evidenceDirectory:path.join(outboxDir,'verification')};
  fs.mkdirSync(outboxDir,{recursive:true});
  fs.writeFileSync(path.join(outboxDir,'last-run-summary.json'),JSON.stringify(summary,null,2));
  console.log(`\n============= RUN RESULTS =============\nApplications opened: ${processed}\nEmployer email-confirmed submissions (SUCCESS): ${gmailSummary.totalEmailConfirmed??'Not checked'}\nGmail verification: ${gmailSummary.status}\nBrowser-verified (not employer email): ${counts.confirmed}\nSubmitted, awaiting second proof: ${counts.pendingReceipt}\nSubmit attempted, outcome unknown: ${counts.unverified}\nReview/blockers: ${counts.needsReview+counts.blocked+counts.loginRequired}\nTimed-out items: ${timeouts} (skipped)\nOther outcomes: ${counts.other+counts.failed+counts.errors+counts.invalidJob+counts.alreadyApplied}\nFeeds loaded: ${feedsLoaded}; feed candidates: ${feedLinks}\nBrowser searches: ${searches}; browser candidates: ${browserLinks}\nAccount sites enabled: ${(loginStage.report?.autoEnabled||[]).join(', ')||'(prelogin disabled)'}\nSites paused for sign-in/security challenge: ${[...blockedSources].join(', ')||'none'}\nSimplify Start Application clicks: ${simplifyStartClicks}; autofill clicks: ${simplifyClicks}; jobs using Simplify: ${simplifyUsed} (not verified submissions)\nLog: ${logPath}\nProof: ${path.join(outboxDir,'verification')}\n=======================================`);
  if(!processed) console.warn('No applications were opened. Check sign-in, search source results, strict filters, or put direct links in config.jobUrls.');
}

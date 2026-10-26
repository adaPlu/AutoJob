// SPDX-License-Identifier: MIT
// v1.5.1 - Browser-based login staging with explicit automatic source eligibility.
// No credential collection, password injection, cookie export, CAPTCHA bypass or undocumented APIs.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { SOURCE_DEFS } from './discover.js';
import { handleSiteAcknowledgements } from './acknowledgements.js';

// Canonical site entry points: use home/dashboard URLs rather than guessed authentication endpoints.
export const ACCOUNT_ENTRYPOINTS = Object.freeze({
  simplify: 'https://simplify.jobs/',
  linkedin: 'https://www.linkedin.com/feed/',
  indeed: 'https://www.indeed.com/',
  dice: 'https://www.dice.com/',
  wellfound: 'https://wellfound.com/',
  builtin: 'https://builtin.com/',
  ziprecruiter: 'https://www.ziprecruiter.com/',
  glassdoor: 'https://www.glassdoor.com/',
  monster: 'https://www.monster.com/',
  careerbuilder: 'https://www.careerbuilder.com/',
  handshake: 'https://app.joinhandshake.com/stu/postings',
  usajobs: 'https://www.usajobs.gov/',
  jobright: 'https://jobright.ai/',
  welcometothejungle: 'https://www.welcometothejungle.com/',
  ycombinator: 'https://www.ycombinator.com/jobs'
});
export const PER_EMPLOYER_SOURCES = Object.freeze([
  'greenhouse','lever','ashby','workday','smartrecruiters','icims','companycareers'
]);
export const PUBLIC_SOURCES = Object.freeze([
  'jobicy','remotive','remoteok','weworkremotely','remoteco'
]);

export function loginPlan(config={}) {
  const enabled = [...new Set(config.sources || [])];
  const accounts=enabled.filter(source=>ACCOUNT_ENTRYPOINTS[source])
    .map(source=>({source,label:SOURCE_DEFS[source]?.label||source,url:ACCOUNT_ENTRYPOINTS[source]}));
  const perEmployer=enabled.filter(s=>PER_EMPLOYER_SOURCES.includes(s));
  const publicSites=enabled.filter(s=>PUBLIC_SOURCES.includes(s));
  const unclassified=enabled.filter(s=>!ACCOUNT_ENTRYPOINTS[s] && !PER_EMPLOYER_SOURCES.includes(s) && !PUBLIC_SOURCES.includes(s));
  const seen=new Set(accounts.map(x=>x.url));
  const direct=[];
  for(const raw of (config.jobUrls||[])) {
    const url=typeof raw==='string'?raw:raw?.url;
    try {
      const u=new URL(url);
      if(!['https:','http:'].includes(u.protocol)||seen.has(u.origin))continue;
      seen.add(u.origin);
      direct.push({source:`direct:${u.hostname}`,label:`Direct employer: ${u.hostname}`,url:u.toString(),direct:true});
    }catch{}
  }
  return {accounts:[...accounts,...direct],publicSites,perEmployer,unclassified};
}

export function sessionState(url='',signals={}) {
  let pathName='';
  try{pathName=new URL(url).pathname;}catch{}
  const authPath=/(^|\/)(login|signin|sign-in|authenticate|auth|sso|register)(\/|$)/i.test(pathName);
  if(signals.challenge) return 'human-verification';
  if(signals.passwordVisible || (authPath && signals.signInVisible))return 'login-required';
  if(signals.signOutVisible)return 'likely-authenticated';
  if(authPath) return 'login-required';
  return 'authentication-unverified';
}

export async function getPageSessionState(page) {
  if (!page || page.isClosed())return 'page-unavailable';
  try{
    const signals=await page.evaluate(()=>{
      const visible=el=>!!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const els=Array.from(document.querySelectorAll('a,button,[role="button"],input[type="submit"]')).filter(visible);
      const label=el=>(el.innerText||el.getAttribute('aria-label')||el.getAttribute('value')||'').trim();
      return {
        passwordVisible:Array.from(document.querySelectorAll('input[type="password"]')).some(visible),
        signInVisible:els.some(el=>/^(?:log[ -]?in|sign[ -]?in|continue with email)$/i.test(label(el))),
        signOutVisible:els.some(el=>/^(?:log[ -]?out|sign[ -]?out)$/i.test(label(el))),
        challenge:!!document.querySelector('iframe[src*="captcha"],iframe[src*="challenges.cloudflare"],.g-recaptcha')
      };
    });
    return sessionState(page.url(),signals);
  }catch{return 'unverified';}
}

function safeSiteUrl(raw) {
  try {const u=new URL(raw);return `${u.origin}${u.pathname}`;}catch{return '';}
}

function buildReporter(status,config,root) {
  const report={version:'1.5.1',createdAt:new Date().toISOString(),
    requiresManualSignIn:true,noPasswordsStored:true,
    sites:status,siteCount:status.length,
    loginRequired:status.filter(x=>x.state==='login-required').map(x=>x.source),
    challenges:status.filter(x=>x.state==='human-verification').map(x=>x.source),
    autoEnabled:status.filter(x=>x.autoSearchEnabled).map(x=>x.source),
    blocked:status.filter(x=>!x.autoSearchEnabled).map(x=>({source:x.source,state:x.state})),
    configuredAccountSources:Object.keys(ACCOUNT_ENTRYPOINTS).filter(x=>(config.sources||[]).includes(x)),
    note:'Logged-in is not guaranteed by this report. A final employer confirmation is separate from session readiness.'};
  const target=path.join(root,'data','prelogin-status.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(report,null,2));
  return report;
}

async function defaultPrompt(message) {
  if(!process.stdin.isTTY){throw new Error('PRELOGIN NEEDS INTERACTIVE TERMINAL: run PRELOGIN_JOB_SITES.bat or RUN_AUTOMATOR.bat by double-clicking it on Windows.');}
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{return await rl.question(message);}finally{rl.close();}
}

export async function runPreLogin({context,config={},root,ask=defaultPrompt,logger=console}) {
  const settings=config.preLogin||{};
  const plan=loginPlan(config);
  if(settings.enabled===false) return {enabled:false,blockedSources:[],report:null,proceed:true,plan};
  logger.log(`\n========== JOB-SITE LOGIN CHECK ==========`);
  logger.log(`Opening ${plan.accounts.length} account site(s) in the dedicated Chrome profile BEFORE searching.`);
  logger.log(`${plan.publicSites.length} sites use public listings (no login required).`);
  logger.log(`${plan.perEmployer.length} ATS sources have employer-specific accounts; no global login exists.`);
  if(plan.unclassified.length)logger.warn(`Unclassified sites: ${plan.unclassified.join(', ')}`);
  logger.log('Complete sign-in, SSO, one-time codes, CAPTCHA, and Simplify setup YOURSELF in Chrome.');
  logger.log('Do NOT enter passwords into the terminal or share them with the program.');
  const opened=[];
  const concurrency=Math.min(4,Math.max(1,Number(settings.openConcurrency)||3));
  let cursor=0;
  async function worker(){
    for(;;){
      const index=cursor++;
      if(index>=plan.accounts.length)break;
      const target=plan.accounts[index];
      let page;
      try {
        page=await context.newPage();
        page.setDefaultTimeout(8000);
        await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:Math.max(5000,Number(settings.navigationTimeoutMs)||12000)});
        await handleSiteAcknowledgements(page,config);
        opened[index]={...target,page,opened:true};
      }catch(error){
        opened[index]={...target,page,opened:false,error:String(error?.message||error).slice(0,140)};
      }
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  for(const row of opened){
    logger.log(`  ${row.opened?'OPEN':'CHECK'} ${row.label}: ${row.url}${row.error?` (${row.error})`:''}`);
  }
  logger.log('\nLog in to every account site you use. When finished, return to this terminal.');
  let response;
  try{
    response=(await ask('Type READY and press Enter to check sessions and begin job searching (or CANCEL to stop): ')).trim().toUpperCase();
  }catch(error){
    for(const o of opened) await o.page?.close().catch(()=>{});
    throw error;
  }
  if(response!=='READY'){
    for(const o of opened) await o.page?.close().catch(()=>{});
    logger.warn('Login stage canceled. No job searches or submissions were started.');
    return {enabled:true,proceed:false,blockedSources:[],report:null,plan};
  }
  const status=[];
  for(const item of opened){
    if(item.page && !item.page.isClosed()) await handleSiteAcknowledgements(item.page,config);
    let state=item.page?await getPageSessionState(item.page):'page-unavailable';
    if(!item.opened && (state==='authentication-unverified'||state==='unverified')) state='page-unavailable';
    // Unknown authentication is NOT a reason to disable an account-based job source.
    // The operator already confirmed the sign-in stage by entering READY.
    const autoSearchEnabled=!['login-required','human-verification','page-unavailable'].includes(state);
    const displayState = state==='authentication-unverified' || state==='unverified'
      ? 'AUTO-ENABLED (sign-in unverified; site can still be searched)'
      : state==='likely-authenticated' ? 'AUTO-ENABLED (sign-in likely active)'
      : state==='human-verification' ? 'PAUSED (complete CAPTCHA/security verification)'
      : state==='login-required' ? 'PAUSED (sign-in required)'
      : 'PAUSED (page unavailable)';
    status.push({source:item.source,label:item.label,url:safeSiteUrl(item.page?.url?.()||item.url),state,autoSearchEnabled,manuallyAcknowledged:true});
    logger.log(`  ${displayState}: ${item.label}`);
  }
  // All login tabs were created by AutoJob, so they may be safely released if Chrome
  // later runs out of tab resources. Never close existing/user-created Chrome tabs.
  let loginTabsReleased=false;
  const releaseLoginTabs=async()=>{
    if(loginTabsReleased)return 0;
    let released=0;
    for(const o of opened){
      if(!o.page || o.page.isClosed())continue;
      try{await o.page.close({runBeforeUnload:false});released++;}catch{}
    }
    loginTabsReleased=true;
    return released;
  };
  // Keep the existing closeLoginTabs preference unless resource recovery is necessary.
  if(settings.closeLoginTabs!==false)await releaseLoginTabs();
  const report=buildReporter(status,config,root);
  const blocked=status.filter(s=>!s.autoSearchEnabled).map(s=>s.source);
  const isStrict=settings.requireAllAccountSessions===true;
  const proceed=!isStrict||!blocked.length;
  logger.log(`AUTOMATIC SEARCH ENABLED: ${status.filter(s=>s.autoSearchEnabled).length}/${status.length} account-based sites. ${blocked.length} require attention.${isStrict&&!proceed?' Strict mode will stop this run.':''}`);
  logger.log('Any site labeled AUTO-ENABLED will be searched and applications attempted automatically, subject to the normal limits and job filters.');
  logger.log('A sign-in marked unverified does not certify that the account is authenticated.');
  logger.log(`Report saved to data/prelogin-status.json.`);
  return {enabled:true,proceed,blockedSources:settings.skipUnavailableSources===false?[]:blocked,report,plan,releaseLoginTabs};
}

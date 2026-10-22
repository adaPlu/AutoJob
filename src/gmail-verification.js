// Count successful applications only after a uniquely matched affirmative Gmail receipt.
// Do not write full email bodies, OAuth credentials or other unrelated inbox content to logs.
import fs from 'node:fs';
import path from 'node:path';
import {readLog,appendLog,ensureLog} from './log.js';
import {normalizeUrl} from './discover.js';
import {ledgerPath,updateLedger} from './submission-ledger.js';
import {loadGmailOAuthClient,listGmailAccounts,authorizedToken,gmailMessages,gmailMessage} from './gmail-client.js';

const SUBMITTED=new Set(['submitted-confirmed','submitted-verified','submitted-pending-receipt','submit-clicked-unverified','submission-unverified','submit-attempted']);
const SUCCESS='submitted-email-confirmed';
const POSITIVE=/\b(?:thank(?:s| you)(?: so much)? for (?:applying|your application)|application (?:was|has been|is) (?:successfully )?(?:received|submitted)|application received|we (?:have )?received your application|we received your application|we(?:'|’)ve received your application|application (?:confirmation|acknowledg(?:e)?ment))\b/i;
const NEGATIVE=/\b(?:application sent to|forwarded your application|job alert|jobs you might like|new jobs|recommended jobs|incomplete application|finish your application|your application was not submitted|failed to submit|rejected your application|application withdrawn)\b/i;
const NON_JOBS=/\b(?:credit card application|mortgage application|loan application|rental application|insurance application)\b/i;
const COMMON=new Set(['the','and','for','from','company','corp','corporation','inc','llc','ltd','limited','technologies','technology','software','solutions','group','systems','careers','jobs','team','your','application','thanks','thank','you','apply']);
const norm=s=>String(s||'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function tokens(s){return norm(s).split(' ').filter(t=>t.length>=3&&!COMMON.has(t));}
function possibleCompany(email,company){
  const label=norm(company);
  if(label.length<4)return false;
  const doc=norm(`${email.subject} ${email.from} ${email.bodySnippet}`);
  if(label.length>=5 && doc.includes(label))return true;
  const parts=tokens(company);
  if(!parts.length)return false;
  // A distinctive brand name in the mail's title, signed sender or the body.
  return parts.every(x=>new RegExp(`\\b${x}\\b`).test(doc));
}
function distinctiveTitle(email,title){
  const text=norm(`${email.subject} ${email.bodySnippet}`);
  const words=tokens(title).filter(x=>x.length>3);
  return words.length>0 && words.every(x=>new RegExp(`\\b${x}\\b`).test(text));
}
export function awaitingReceiptJobs(rows){
  const grouped=new Map();
  for(const row of rows){
    const url=normalizeUrl(row.url,row.url),status=row.status||'';
    if(!url)continue;
    let state=grouped.get(url);
    if(!state){state={url,company:'',title:'',timestamp:'',submissions:[],confirmed:false};grouped.set(url,state);}
    if(row.company)state.company=row.company;
    if(row.title)state.title=row.title;
    if(status===SUCCESS)state.confirmed=true;
    if(SUBMITTED.has(status)){
      const ts=Date.parse(row.timestamp);
      if(Number.isFinite(ts))state.submissions.push(ts);
    }
  }
  return [...grouped.values()].filter(x=>!x.confirmed&&x.company&&x.submissions.length).map(x=>({...x,firstAttempt:Math.min(...x.submissions),lastAttempt:Math.max(...x.submissions)}));
}
export function matchGmailReceipts(jobs,messages,{now=Date.now()}={}){
  const accepted=[],ambiguous=[],rejected=[],reserved=new Set();
  // A receipt gets assigned at most once; tie-break by exact title if a company has several applications.
  for(const m of [...messages].sort((a,b)=>Date.parse(a.receivedAt)-Date.parse(b.receivedAt))){
    if(!m?.id || reserved.has(m.id))continue;
    const body=`${m.subject||''} ${m.bodySnippet||''}`;
    if(!POSITIVE.test(body)||NEGATIVE.test(body)||NON_JOBS.test(body)||/\bSENT\b/.test((m.labels||[]).join(' ')))continue;
    const timestamp=Date.parse(m.receivedAt);
    if(!Number.isFinite(timestamp)||timestamp>now+300000)continue;
    const from=m.from||'';
    if(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(from))continue;
    const potentials=jobs.filter(job=>!accepted.some(x=>x.url===job.url) &&
      timestamp>=job.firstAttempt-5*60000 && timestamp<=job.lastAttempt+7*86400000 && possibleCompany(m,job.company));
    if(!potentials.length){rejected.push({id:m.id,reason:'No matching, recent job/company'});continue;}
    let selected=potentials;
    if(potentials.length>1){
      const exact=potentials.filter(job=>distinctiveTitle(m,job.title));
      if(exact.length===1)selected=exact;
    }
    if(selected.length!==1){ambiguous.push({id:m.id,reason:'Multiple plausible job applications; title-specific confirmation required',urls:potentials.map(x=>x.url)});continue;}
    accepted.push({url:selected[0].url,company:selected[0].company,title:selected[0].title,messageId:m.id,from:m.from,subject:m.subject,receivedAt:m.receivedAt});
    reserved.add(m.id);
  }
  return {accepted,ambiguous,rejected};
}
export async function verifyGmailReceipts({root,quiet=false,maxMessages=200,signal}={}){
  const logPath=path.join(root,'data','application-log.csv');
  ensureLog(logPath);
  const jobs=awaitingReceiptJobs(readLog(logPath));
  const accounts=listGmailAccounts(root);
  const output={checkedAt:new Date().toISOString(),status:'',accounts:accounts.map(x=>x.email),pendingJobs:jobs.length,
    newlyEmailConfirmed:0,totalEmailConfirmed:0,ambiguous:0,rejected:0,errors:[]};
  const before=new Set(readLog(logPath).filter(r=>r.status===SUCCESS).map(r=>normalizeUrl(r.url,r.url)));
  output.totalEmailConfirmed=before.size;
  if(!accounts.length){output.status='not-connected';return output;}
  let client;
  try{client=loadGmailOAuthClient(root);}catch(err){output.status='auth-error';output.errors.push(err.message);return output;}
  if(!client){output.status='credentials-missing';return output;}
  if(!jobs.length){output.status='checked-no-pending-jobs';return output;}
  const start=new Date(Math.max(Date.now()-45*86400000,Math.min(...jobs.map(x=>x.firstAttempt))-86400000));
  const messages=[];
  let accountsChecked=0;
  for(const account of accounts){
    try{
      if(signal?.aborted)throw signal.reason||new Error('Gmail check aborted');
      const access=await authorizedToken(client,account,{signal});
      const ids=await gmailMessages(access,{after:start,maxMessages,signal});
      for(const id of ids){if(signal?.aborted)throw signal.reason||new Error('Gmail check aborted');try{messages.push({...await gmailMessage(access,id.id,{signal}),id:`${account.email}:${id.id}`});}catch(error){output.errors.push(`${account.email}: message lookup failed: ${String(error.message).slice(0,100)}`);}}
      accountsChecked++;
    }catch(err){output.errors.push(`${account.email}: ${String(err.message||err).slice(0,180)}`);}
  }
  const matches=matchGmailReceipts(jobs,messages);
  output.ambiguous=matches.ambiguous.length;
  output.rejected=matches.rejected.length;
  for(const match of matches.accepted){
    if(before.has(match.url))continue;
    appendLog(logPath,{timestamp:new Date().toISOString(),company:match.company,title:match.title,url:match.url,source:'gmail-receipt',status:SUCCESS,
      submission_verified:'yes',verification_evidence:`Gmail message ${match.messageId}; sender ${match.from}; received ${match.receivedAt}`});
    updateLedger(ledgerPath(root),match.url,SUCCESS,{emailMessageId:match.messageId,emailReceivedAt:match.receivedAt});
    before.add(match.url);output.newlyEmailConfirmed++;
    if(!quiet)console.log(`EMAIL CONFIRMED: ${match.company} — ${match.title}`);
  }
  output.totalEmailConfirmed=before.size;
  output.status=accountsChecked===0?'gmail-check-failed':output.errors.length?'partial-check':'checked';
  return output;
}

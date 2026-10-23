// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitingReceiptJobs,matchGmailReceipts} from '../src/gmail-verification.js';
const urlA='https://example.test/jobs/role-a',urlB='https://example.test/jobs/role-b';
const timestamp='2026-10-22T17:00:00.000Z';
function row(url,company='Example Corp',title='Backend Engineer',status='submitted-pending-receipt'){
 return {url,company,title,status,timestamp};
}
function email(overrides={}){
 return {id:'gmail-123',from:'Talent Team <careers@example.com>',subject:'Thank you for applying to Example Corp — Backend Engineer',
   receivedAt:'2026-10-22T17:02:00.000Z',bodySnippet:'We have received your application for Backend Engineer. Thank you for applying to Example Corp.', ...overrides};
}
const now=Date.parse('2026-10-22T19:00:00.000Z');
test('unique employer receipt confirms matching submitted job, once only',()=>{
 const jobs=awaitingReceiptJobs([row(urlA)]);
 assert.equal(jobs.length,1);
 const result=matchGmailReceipts(jobs,[email(),email()],{now});
 assert.equal(result.accepted.length,1);
 assert.equal(result.accepted[0].url,urlA);
});
test('neither browser attempt without email nor email unrelated to company counts',()=>{
 const jobs=awaitingReceiptJobs([row(urlA)]);
 assert.equal(matchGmailReceipts(jobs,[],{now}).accepted.length,0);
 assert.equal(matchGmailReceipts(jobs,[email({from:'careers@anotherbiz.com',subject:'Thank you for applying to Another Biz',bodySnippet:'application received by Another Biz'})],{now}).accepted.length,0);
});
test('unsubmitted application never counts even if an email exists',()=>{
 const jobs=awaitingReceiptJobs([row(urlA,'Example Corp','Backend Engineer','ready-for-submit')]);
 assert.equal(matchGmailReceipts(jobs,[email()],{now}).accepted.length,0);
});
test('email before the application, forwarding notice, promotional alert or non-job mail is excluded',()=>{
 const jobs=awaitingReceiptJobs([row(urlA)]);
 for (const m of [
   email({receivedAt:'2026-10-21T16:00:00Z'}),
   email({subject:'Your application sent to Example Corp',bodySnippet:'Your application was sent to Example Corp'}),
   email({subject:'Example Corp job alert',bodySnippet:'Jobs you might like'}),
   email({subject:'Your credit card application received',bodySnippet:'Example Corp loan offer'})
 ])assert.equal(matchGmailReceipts(jobs,[m],{now}).accepted.length,0);
});
test('same employer with 2 applications requires uniquely named role',()=>{
 const jobs=awaitingReceiptJobs([row(urlA),row(urlB,'Example Corp','Data Scientist')]);
 const ambiguous=matchGmailReceipts(jobs,[email({subject:'Thank you for applying to Example Corp',bodySnippet:'We have received your application.'})],{now});
 assert.equal(ambiguous.accepted.length,0);assert.equal(ambiguous.ambiguous.length,1);
 const matched=matchGmailReceipts(jobs,[email()],{now});
 assert.equal(matched.accepted.length,1);assert.equal(matched.accepted[0].url,urlA);
});
test('previously email-confirmed job is never counted again',()=>{
 const jobs=awaitingReceiptJobs([row(urlA),row(urlA,'Example Corp','Backend Engineer','submitted-email-confirmed')]);
 assert.equal(jobs.length,0);
});

test('local Gmail REST verification updates log/ledger once and preserves email-verified success',async()=>{
 const fs=(await import('node:fs')).default;
 const os=(await import('node:os')).default;
 const path=(await import('node:path')).default;
 const {appendLog,readLog}=await import('../src/log.js');
 const {verifyGmailReceipts}=await import('../src/gmail-verification.js');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'autojob-gmail-'));
 const log=path.join(root,'data','application-log.csv');
 const oldFetch=globalThis.fetch;
 try{
  fs.writeFileSync(path.join(root,'gmail-credentials.json'),JSON.stringify({installed:{client_id:'TEST_ID',client_secret:'TEST_SECRET'}}));
  const dir=path.join(root,'data','gmail-tokens');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'user.json'),JSON.stringify({email:'demo@gmail.test',refresh_token:'fake-refresh',access_token:'fake-access',expires_at:Date.now()+86400000}));
  appendLog(log,row(urlA));
  const message={id:'actual-msg',internalDate:String(Date.parse('2026-10-22T17:02:00.000Z')),labelIds:['INBOX'],snippet:'We have received your application for Backend Engineer with Example Corp.',payload:{headers:[{name:'From',value:'Career Desk <noreply@example.com>'},{name:'Subject',value:'Thank you for applying to Example Corp — Backend Engineer'}]}};
  let apiCalls=0;
  globalThis.fetch=async url=>{
   apiCalls++;
   if(String(url).includes('/messages/actual-msg'))return new Response(JSON.stringify(message),{status:200});
   if(String(url).includes('/messages'))return new Response(JSON.stringify({messages:[{id:'actual-msg'}]}),{status:200});
   throw new Error('Unexpected external network request');
  };
  const first=await verifyGmailReceipts({root});
  assert.equal(first.status,'checked');assert.equal(first.newlyEmailConfirmed,1);
  const second=await verifyGmailReceipts({root});
  assert.equal(second.newlyEmailConfirmed,0);
  assert.equal(second.totalEmailConfirmed,1);
  assert.equal(readLog(log).filter(r=>r.status==='submitted-email-confirmed').length,1);
  assert.ok(apiCalls>=2);
 } finally{globalThis.fetch=oldFetch;fs.rmSync(root,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loginPlan,sessionState,runPreLogin} from '../src/prelogin.js';

test('prelogin plan distinguishes shared account sites, employer-specific ATS, and public feed sites',()=>{
  const plan=loginPlan({sources:['simplify','linkedin','handshake','workday','lever','greenhouse','jobicy','remotive','remoteok'],jobUrls:['https://demo.myworkdayjobs.com/job/123','https://demo.myworkdayjobs.com/job/456']});
  assert.deepEqual(plan.accounts.map(t=>t.source),['simplify','linkedin','handshake','direct:demo.myworkdayjobs.com']);
  assert.deepEqual(plan.perEmployer,['workday','lever','greenhouse']);
  assert.deepEqual(plan.publicSites,['jobicy','remotive','remoteok']);
});
test('visible sign-in and challenge remain non-authenticated, logout suggests likely authenticated',()=>{
  assert.equal(sessionState('https://www.linkedin.com/login',{passwordVisible:true}),'login-required');
  assert.equal(sessionState('https://www.linkedin.com/auth/login',{}),'login-required');
  assert.equal(sessionState('https://linkedin.com/feed/',{signOutVisible:true}),'likely-authenticated');
  assert.equal(sessionState('https://simplify.jobs/',{}),'authentication-unverified');
  assert.equal(sessionState('https://simplify.jobs/',{challenge:true}),'human-verification');
});
function contextWithStates(states){
  let i=0;
  return {
    newPage:async()=>{
      const state=states[i++];
      return { setDefaultTimeout:()=>{},goto:async()=>{},url:()=>state.url,
        evaluate:async()=>state.signals, isClosed:()=>false,close:async()=>{state.closed=true;} };
    }
  };
}
test('prelogin requires READY and does not start searching when canceled',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-login-test-'));
  const s={url:'https://www.linkedin.com/feed/',signals:{signOutVisible:true}};
  const stage=await runPreLogin({context:contextWithStates([s]),root,config:{sources:['linkedin']},ask:async()=> 'CANCEL',logger:{log:()=>{},warn:()=>{}}});
  assert.equal(stage.proceed,false);
  assert.equal(s.closed,true);
  assert.equal(fs.existsSync(path.join(root,'data','prelogin-status.json')),false);
  fs.rmSync(root,{recursive:true,force:true});
});
test('prelogin checks account status, saves no credentials and blocks logged-out site',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-login-test-'));
  const entries=[{url:'https://www.linkedin.com/login',signals:{passwordVisible:true,signInVisible:true}},{url:'https://simplify.jobs/',signals:{signOutVisible:true}}];
  const config={sources:['linkedin','simplify','remotive','workday'],preLogin:{requireAllAccountSessions:false}};
  const stage=await runPreLogin({context:contextWithStates(entries),root,config,ask:async()=> 'READY',logger:{log:()=>{},warn:()=>{}}});
  assert.equal(stage.proceed,true);
  assert.deepEqual(stage.blockedSources,['linkedin']);
  assert.equal(entries[0].closed,true);
  const content=fs.readFileSync(path.join(root,'data','prelogin-status.json'),'utf8');
  assert.equal(JSON.parse(content).sites.length,2);
  assert.ok(!/password\s*:/i.test(content));
  fs.rmSync(root,{recursive:true,force:true});
});
test('strict account stage stops if login was not completed',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-login-test-'));
  const stage=await runPreLogin({context:contextWithStates([{url:'https://app.joinhandshake.com/login',signals:{passwordVisible:true}}]),root,config:{sources:['handshake'],preLogin:{requireAllAccountSessions:true}},ask:async()=> 'READY',logger:{log:()=>{},warn:()=>{}}});
  assert.equal(stage.proceed,false);
  fs.rmSync(root,{recursive:true,force:true});
});

test('unknown sign-in is auto-enabled after READY, while actual login and CAPTCHA still block',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-auto-login-'));
 const sites=[
  {url:'https://www.linkedin.com/feed/',signals:{}},
  {url:'https://simplify.jobs/',signals:{}},
  {url:'https://www.dice.com/',signals:{challenge:true}},
  {url:'https://www.monster.com/',signals:{signOutVisible:true}}
 ];
 const stage=await runPreLogin({context:contextWithStates(sites),root,config:{sources:['linkedin','simplify','dice','monster']},ask:async()=> 'READY',logger:{log:()=>{},warn:()=>{}}});
 assert.equal(stage.proceed,true);
 assert.deepEqual(stage.blockedSources,['dice']);
 assert.deepEqual(stage.report.autoEnabled,['linkedin','simplify','monster']);
 assert.equal(stage.report.sites.find(x=>x.source==='linkedin').autoSearchEnabled,true);
 assert.equal(stage.report.sites.find(x=>x.source==='dice').autoSearchEnabled,false);
 fs.rmSync(root,{recursive:true,force:true});
});

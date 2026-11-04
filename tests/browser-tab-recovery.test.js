// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {openSearchTab,ChromeTabUnavailableError} from '../src/browser.js';

test('a temporary Chrome tab-creation error retries without affecting existing tabs',async()=>{
  let attempts=0,cleanups=0,timeout=0;
  const page={setDefaultTimeout:ms=>{timeout=ms;}};
  const context={newPage:async()=>{
    if(++attempts===1)throw new Error('Protocol error (Target.createTarget): Failed to open a new tab');
    return page;
  }};
  const found=await openSearchTab(context,{retryDelayMs:0,onResourceError:async()=>{cleanups++;return 0;},logger:{warn:()=>{}}});
  assert.equal(found,page);
  assert.equal(attempts,2);
  assert.equal(cleanups,1);
  assert.equal(timeout,8500);
});

test('resource recovery can release only explicitly owned login tabs',async()=>{
  let attempts=0,closed=0,unrelatedClosed=false;
  const owned={close:async()=>{closed++;}};
  const unrelated={close:async()=>{unrelatedClosed=true;}};
  const context={newPage:async()=>{
    if(++attempts===1)throw new Error('Failed to open a new tab');
    return {setDefaultTimeout:()=>{}};
  }};
  await openSearchTab(context,{retryDelayMs:0,onResourceError:async()=>{await owned.close();return 1;},logger:{warn:()=>{}}});
  assert.equal(closed,1);
  assert.equal(unrelatedClosed,false);
  assert.ok(unrelated);
});

test('persistent refusal is an actionable error rather than an unhandled crash',async()=>{
  let attempts=0;
  const context={newPage:async()=>{attempts++;throw new Error('Target.createTarget failed');}};
  await assert.rejects(
    openSearchTab(context,{maxAttempts:3,retryDelayMs:0,onResourceError:async()=>0,logger:{warn:()=>{}}}),
    err=>err instanceof ChromeTabUnavailableError && /restart.*Chrome profile/i.test(err.message)
  );
  assert.equal(attempts,3);
});

test('search acquisition retains an existing AutoJob-owned tab even when Chrome rejects new tabs',async()=>{
  const {acquireSearchTab}=await import('../src/browser.js');
  let createCalls=0,timeout=0;
  const page={isClosed:()=>false,setDefaultTimeout:n=>{timeout=n;}};
  const context={newPage:async()=>{createCalls++;throw new Error('Target.createTarget failed');}};
  const chosen=await acquireSearchTab(context,{searchPage:page});
  assert.strictEqual(chosen,page);
  assert.equal(createCalls,0);
  assert.equal(timeout,8500);
});

test('search acquisition falls back safely if reserved AutoJob tab has been closed',async()=>{
  const {acquireSearchTab}=await import('../src/browser.js');
  let createCalls=0;
  const fresh={setDefaultTimeout:()=>{}};
  const context={newPage:async()=>{createCalls++;return fresh;}};
  const chosen=await acquireSearchTab(context,{searchPage:{isClosed:()=>true}});
  assert.equal(chosen,fresh);
  assert.equal(createCalls,1);
});

test('persistent target refusal exposes underlying cause in startup error for diagnosis',async()=>{
  const context={newPage:async()=>{throw new Error('Protocol error (Target.createTarget): insufficient resources');}};
  await assert.rejects(
    openSearchTab(context,{maxAttempts:2,retryDelayMs:0,logger:{warn:()=>{}}}),
    error=>error instanceof ChromeTabUnavailableError
      && /Target\.createTarget/.test(error.message)
      && /insufficient resources/.test(error.message)
      && /No job search or submission started/.test(error.message)
  );
});

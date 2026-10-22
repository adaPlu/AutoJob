import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithWatchdog, watchdogTimeoutMs, ItemTimedOutError} from '../src/watchdog.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('5 minute default timeout is configurable',()=>{
  assert.equal(watchdogTimeoutMs({}),300_000);
  assert.equal(watchdogTimeoutMs({itemInactivityTimeoutMs:1200}),1200);
});
test('successful task proceeds without cleanup',async()=>{
  let cleanup=0;
  const out=await runWithWatchdog({label:'fast item',timeoutMs:150,
    task:async()=>{await pause(12);return ['job'];},onTimeout:()=>{cleanup++;}});
  assert.equal(out.timedOut,false);
  assert.deepEqual(out.value,['job']);
  assert.equal(cleanup,0);
});
test('stalled item gets abort signal, closes resources and next item can run',async()=>{
  let aborted=false,cleaned=0;
  const first=await runWithWatchdog({label:'stalled site',timeoutMs:35,
    task:({signal})=>new Promise(resolve=>{
      signal.addEventListener('abort',()=>{aborted=true;resolve('cancelled');},{once:true});
    }),onTimeout:()=>{cleaned++;},logger:{warn:()=>{}}});
  assert.equal(first.timedOut,true);
  assert.ok(first.error instanceof ItemTimedOutError);
  assert.equal(cleaned,1);
  assert.equal(aborted,true);
  const next=await runWithWatchdog({label:'next site',timeoutMs:100,task:async()=>42});
  assert.equal(next.value,42);
});
test('completed progress milestone resets 5-minute-style inactivity timer',async()=>{
  const out=await runWithWatchdog({label:'progressing item',timeoutMs:75,
    task:async({progress})=>{
      await pause(43);progress('page 1 complete');
      await pause(43);progress('page 2 complete');
      await pause(43);return 'completed';
    },logger:{warn:()=>{}}});
  assert.equal(out.timedOut,false);
  assert.equal(out.value,'completed');
});
test('normal item error is returned for caller to record and continue',async()=>{
  const out=await runWithWatchdog({label:'broken site',timeoutMs:100,
    task:async()=>{throw new Error('site unavailable');}});
  assert.equal(out.timedOut,false);
  assert.match(out.error.message,/site unavailable/);
});

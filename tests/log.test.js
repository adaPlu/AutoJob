// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCsv, readLog, appendLog, ensureLog, applicationHistory, shouldSkipJob, HEADER } from '../src/log.js';
import { readLedger, updateLedger } from '../src/submission-ledger.js';
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(),'jobauto-test-')); }
test('CSV handles quoted commas and linebreaks, old schema migration preserves data',()=>{
  const dir=tmp();try {
    const file=path.join(dir,'application-log.csv');
    fs.writeFileSync(file,'timestamp,company,title,url,status,blocker\n2026-01-01,"Nile, Inc.","Engineer, ML",https://jobs.example.com/x,submission-unverified,"Line 1\nLine 2"\n');
    ensureLog(file);
    const rows=readLog(file);
    assert.equal(rows.length,1);
    assert.equal(rows[0].company,'Nile, Inc.');
    assert.equal(rows[0].blocker,'Line 1\nLine 2');
    assert.equal(rows[0].status,'submission-unverified');
    assert.equal(parseCsv(fs.readFileSync(file,'utf8'))[0].length,HEADER.length);
    assert.ok(fs.existsSync(file+'.pre-v1.3-backup'));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('confirmed and uncertain statuses are skipped, definite failure is retryable',()=>{
  const dir=tmp();try {
    const file=path.join(dir,'log.csv');
    appendLog(file,{url:'https://jobs.example.com/a?utm_source=abc',status:'submitted-confirmed'});
    appendLog(file,{url:'https://jobs.example.com/b',status:'submit-clicked-unverified'});
    appendLog(file,{url:'https://jobs.example.com/c',status:'submission-failed'});
    appendLog(file,{url:'https://jobs.example.com/d',status:'error'});
    let history=applicationHistory(file);
    assert.ok(shouldSkipJob('https://jobs.example.com/a',history,new Map()));
    assert.ok(shouldSkipJob('https://jobs.example.com/b',history,new Map()));
    assert.equal(shouldSkipJob('https://jobs.example.com/c',history,new Map()),'');
    assert.equal(shouldSkipJob('https://jobs.example.com/d',history,new Map()),'');
    appendLog(file,{url:'https://jobs.example.com/b',status:'manual-confirmed-not-submitted'});
    history=applicationHistory(file);
    assert.equal(shouldSkipJob('https://jobs.example.com/b',history,new Map()),'');
    for (let i=0;i<2;i++) appendLog(file,{url:'https://jobs.example.com/d',status:'error'});
    assert.equal(shouldSkipJob('https://jobs.example.com/d',applicationHistory(file),new Map(),3),'retry-limit-reached');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('write-ahead ledger blocks interrupted, uncertain and pending submissions',()=>{
  const dir=tmp();try {
    const file=path.join(dir,'submit-ledger.json');
    const url='https://jobs.example.com/position/abc';
    updateLedger(file,url,'submit-attempted',{button:'Submit application'});
    assert.equal(shouldSkipJob(url,new Map(),readLedger(file)),'submit-ledger-submit-attempted');
    updateLedger(file,url,'submitted-pending-receipt');
    assert.equal(shouldSkipJob(url,new Map(),readLedger(file)),'submit-ledger-submitted-pending-receipt');
    updateLedger(file,url,'manual-confirmed-not-submitted');
    assert.equal(shouldSkipJob(url,new Map(),readLedger(file)),'');
    updateLedger(file,url,'submission-failed');
    assert.equal(shouldSkipJob(url,new Map(),readLedger(file)),'');
    fs.writeFileSync(file,'corrupt');
    assert.throws(()=>readLedger(file),/Cannot safely read/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('resolvable form review does not permanently lock the submission ledger', () => {
 const hist=new Map(), ledger=new Map([['https://example.org/job/123',{state:'needs-review'}]]);
 assert.equal(shouldSkipJob('https://example.org/job/123',hist,ledger,3),'');
 ledger.set('https://example.org/job/123',{state:'submit-attempted'});
 assert.match(shouldSkipJob('https://example.org/job/123',hist,ledger,3),/submit-ledger/);
});

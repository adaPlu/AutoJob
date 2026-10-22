import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectConfiguration } from '../src/preflight.js';
import { validateReceipt } from '../src/receipt-validation.js';
const conf={autoSubmit:false,strictRemote:true,requireResumeUpload:true,maxJobsPerRun:3,searchQueries:['software remote'],sources:['linkedin']};
const profile={firstName:'Test',lastName:'Person',email:'test@example.org',phone:'000',skills:[]};
test('preflight refuses silent no-submit run and missing resume',()=>{
 const r=inspectConfiguration(conf,profile,'');assert.equal(r.ok,false);assert.match(r.errors.join(';'),/autoSubmit is false/);
});
test('employer acknowledgements but not board forwarding qualify when exact URL matches',()=>{
 const url='https://jobs.example.com/careers/job/123',rows=[{url,timestamp:'2026-10-14T10:00:00Z'}];
 const receipt={url,from:'jobs@example.com',subject:'Application received',receivedAt:'2026-10-14T11:00:00Z',bodySnippet:'We received your application'};
 assert.equal(validateReceipt(receipt,rows).ok,true);
 assert.equal(validateReceipt({...receipt,subject:'Application sent to Acme',bodySnippet:'Your application was sent to Acme'},rows).ok,false);
 assert.equal(validateReceipt({...receipt,url:'https://jobs.example.com/careers/job/999'},rows).ok,false);
 assert.equal(validateReceipt({...receipt,subject:'Loan offer',bodySnippet:'Thanks for applying for a personal loan'},rows).ok,false);
});

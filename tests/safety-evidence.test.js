// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEGAL_CONSENT_LABEL,getLegalConsentBlockers} from '../src/forms.js';
import {awaitingReceiptJobs,matchGmailReceipts} from '../src/gmail-verification.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url='https://careers.example.test/job/backend-engineer';
const at='2026-10-22T17:00:00.000Z';
const now=Date.parse('2026-10-22T20:00:00.000Z');
const job=(status='submit-clicked-unverified')=>({
  timestamp:at,company:'Example Corp',title:'Backend Engineer',url,status
});
const receipt=(subject,bodySnippet)=>({
  id:'gmail:message-1',from:'Recruiting <careers@example.com>',
  subject,bodySnippet,receivedAt:'2026-10-22T17:03:00.000Z',labels:['INBOX']
});

test('example configuration version follows the package release version',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.example.json'),'utf8'));
  assert.equal(config._bundleVersion,pkg.version);
});

test('identifies legal consent and certifications, including prechecked controls',async()=>{
  assert.ok(LEGAL_CONSENT_LABEL.test('I certify that all of my statements are true'));
  assert.ok(LEGAL_CONSENT_LABEL.test('I agree to the arbitration terms'));
  assert.ok(LEGAL_CONSENT_LABEL.test('Consent to a background check'));
  assert.equal(LEGAL_CONSENT_LABEL.test('Email address for job application'),false);
  // Playwright evaluateAll does not omit checked controls: labels are inspected
  // irrespective of checkbox state.
  const fakeRoot={locator:()=>({evaluateAll:async()=>[
    'I certify that the information in this application is accurate',
    'Subscribe to marketing updates',
    'Consent to a background check']})};
  assert.deepEqual(await getLegalConsentBlockers(fakeRoot),[
    'I certify that the information in this application is accurate',
    'Consent to a background check'
  ]);
});

test('pre-submit write-ahead rows cannot be credited to an employer receipt',()=>{
  const pending=awaitingReceiptJobs([job('submit-attempted')]);
  assert.equal(pending.length,0);
});

test('generic employer receipt is not enough to prove which role was submitted',()=>{
  const pending=awaitingReceiptJobs([job()]);
  const result=matchGmailReceipts(pending,[
    receipt('Thank you for applying to Example Corp','We have received your application.')
  ],{now});
  assert.equal(result.accepted.length,0);
  assert.equal(result.ambiguous.length,1);
});

test('employer acknowledgement with a unique exact role can be confirmed',()=>{
  const pending=awaitingReceiptJobs([job()]);
  const result=matchGmailReceipts(pending,[
    receipt('Thank you for applying to Example Corp — Backend Engineer',
      'We have received your application for Backend Engineer.')
  ],{now});
  assert.equal(result.accepted.length,1);
  assert.equal(result.accepted[0].url,url);
});

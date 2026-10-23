// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmationUrl,matchEvidence,CONFIRMATION_TEXT,FAILURE_TEXT,classifyEvidence } from '../src/verification.js';

const base={submittedClick:true,confirmationText:true,confirmationUrlChanged:true,independentApplied:true,artifactSaved:true,failure:false,challenge:false};
test('only independent applied + saved evidence counts as confirmed',()=>{
  assert.equal(classifyEvidence(base),'submitted-confirmed');
  assert.equal(classifyEvidence({...base,independentApplied:false}),'submitted-pending-receipt');
  assert.equal(classifyEvidence({...base,artifactSaved:false}),'submitted-pending-receipt');
  assert.equal(classifyEvidence({...base,confirmationText:false}),'submitted-pending-receipt');
  assert.equal(classifyEvidence({...base,confirmationText:false,confirmationUrlChanged:false}),'submit-clicked-unverified');
  assert.equal(classifyEvidence({...base,submittedClick:false}),'ready-no-submit-button');
  assert.equal(classifyEvidence({...base,failure:true}),'submission-failed');
  assert.equal(classifyEvidence({...base,challenge:true}),'blocked');
});
test('success URLs matched from pathname, not misleading job title/query',()=>{
  assert.equal(confirmationUrl('https://example.com/jobs/successful-marketing-specialist'),false);
  assert.equal(confirmationUrl('https://example.com/careers?name=confirmation'),false);
  assert.equal(confirmationUrl('https://example.com/applications/thank-you'),true);
  assert.equal(confirmationUrl('https://example.com/applications?id=123&status=submitted'),true);
  assert.equal(confirmationUrl('not a URL'),false);
});
test('recognizes specific receipt phrases and genuine failed submits',()=>{
  assert.match(matchEvidence('Thank you for applying',CONFIRMATION_TEXT),/Thank you for applying/i);
  assert.match(matchEvidence('Your application has been submitted',CONFIRMATION_TEXT),/application/i);
  assert.match(matchEvidence('Unable to submit your application',FAILURE_TEXT),/Unable to submit/i);
  assert.equal(matchEvidence('Please complete the required fields',FAILURE_TEXT),'');
});

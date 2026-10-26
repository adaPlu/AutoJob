// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {companyFromAtsUrl} from '../src/apply.js';
test('company inferred from ATS organization URL',()=>{
  assert.equal(companyFromAtsUrl('https://jobs.lever.co/jobgether/abc'),'Jobgether');
  assert.equal(companyFromAtsUrl('https://jobs.ashbyhq.com/acme-tech/abc'),'Acme Tech');
  assert.equal(companyFromAtsUrl('https://example.com/jobs/other'),'');
});

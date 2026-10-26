// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {privatePath,sensitiveKinds} from '../scripts/audit-public.js';

test('public audit blocks private local inputs but permits examples',()=>{
  for(const p of ['config.json','profile.json','gmail-credentials.json',
    'data/application-log.csv','data/gmail-tokens/user.json','outbox/review.csv',
    'client_secret_example.json','resume.pdf','old-run.zip']) {
    assert.equal(privatePath(p),true,p);
  }
  for(const p of ['config.example.json','profile.example.json',
    'src/gmail-client.js','README.md','package.json']) {
    assert.equal(privatePath(p),false,p);
  }
});

test('public audit flags real-world credential patterns without printing their values',()=>{
  assert.ok(sensitiveKinds(['test','@','gmail.com'].join('')).includes('personal email'));
  assert.ok(sensitiveKinds(['GOC','SPX-','x'.repeat(20)].join('')).includes('OAuth client secret'));
  assert.ok(sensitiveKinds('example@example.test').length===0);
  assert.ok(sensitiveKinds('full name example', {firstName:'Full',lastName:'Name'}).includes('personal name'));
});

// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunBudget} from '../src/run-budget.js';

test('low-fit, wrong-remote, and invalid postings do not consume application slots',()=>{
  const budget=createRunBudget(2,12);
  for(const ignored of ['skipped-low-fit','skipped-not-clearly-remote','skipped-not-individual-job']) {
    budget.record({applicationStarted:false});
    assert.equal(budget.applicationAttempts,0,ignored);
    assert.equal(budget.exhausted,false,ignored);
  }
  budget.record({applicationStarted:true});
  assert.equal(budget.applicationAttempts,1);
  assert.equal(budget.exhausted,false);
  budget.record({applicationStarted:false});
  assert.equal(budget.applicationAttempts,1);
  budget.record({applicationStarted:true});
  assert.equal(budget.applicationAttempts,2);
  assert.equal(budget.inspected,6);
  assert.equal(budget.exhausted,true);
  assert.throws(()=>budget.record({applicationStarted:false}),/exhausted/);
});

test('inspection limit stops endless runs where no application starts',()=>{
  const budget=createRunBudget(2,4);
  for(let i=0;i<4;i++)budget.record({applicationStarted:false});
  assert.equal(budget.applicationAttempts,0);
  assert.equal(budget.inspected,4);
  assert.equal(budget.exhausted,true);
});

test('default inspection budget is independent from application attempts',()=>{
  const budget=createRunBudget(2);
  assert.equal(budget.applicationLimit,2);
  assert.ok(budget.inspectionLimit>=20);
  assert.ok(budget.inspectionLimit>budget.applicationLimit);
});

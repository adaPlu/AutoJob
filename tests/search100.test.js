// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDiscoveryPlan} from '../src/discovery-plan.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const c=JSON.parse(fs.readFileSync(path.join(root,'config.example.json'),'utf8'));

test('current release builds 100 search tasks with balanced round-robin source coverage',()=>{
 const p=buildDiscoveryPlan(c);
 assert.equal(c._bundleVersion,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
 assert.equal(p.searchBudget,100);
 assert.equal(p.browserTasks.length,100);
 assert.equal(p.sourceCount,27);
 assert.equal(p.feeds.length,2);
 const sites=[...new Set(p.browserTasks.map(x=>x.source))];
 assert.equal(sites.length,25);
 for(const site of sites){
   const tasks=p.browserTasks.filter(x=>x.source===site);
   assert.equal(tasks.length,4,site);
   assert.equal(new Set(tasks.map(x=>x.query)).size,4,site);
 }
 assert.equal(c.maxJobsPerRun,200);
 assert.equal(c.requireResumeUpload,true);
});

test('planning stops exactly at a smaller specified search budget',()=>{
 const p=buildDiscoveryPlan({...c,maxDiscoverySearchesPerRun:80});
 assert.equal(p.browserTasks.length,80);
 assert.equal(new Set(p.browserTasks.slice(0,25).map(x=>x.source)).size,25);
});

test('100 is a hard upper limit even if private config requests more',()=>{
 const p=buildDiscoveryPlan({...c,maxDiscoverySearchesPerRun:500});
 assert.equal(p.searchBudget,100);
 assert.equal(p.browserTasks.length,100);
});

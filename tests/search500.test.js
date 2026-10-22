import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDiscoveryPlan} from '../src/discovery-plan.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const c=JSON.parse(fs.readFileSync(path.join(root,'config.example.json'),'utf8'));

test('v1.5.1 default builds all 500 search tasks, 25 sites, 20 unique queries per site',()=>{
 const p=buildDiscoveryPlan(c);
 assert.equal(c._bundleVersion,'1.5.1');
 assert.equal(p.searchBudget,500);
 assert.equal(p.browserTasks.length,500);
 assert.equal(p.sourceCount,27);
 assert.equal(p.feeds.length,2);
 const sites=[...new Set(p.browserTasks.map(x=>x.source))];
 assert.equal(sites.length,25);
 for(const site of sites){
   const tasks=p.browserTasks.filter(x=>x.source===site);
   assert.equal(tasks.length,20,site);
   assert.equal(new Set(tasks.map(x=>x.query)).size,20,site);
 }
 assert.equal(c.maxJobsPerRun,200);
 assert.equal(c.requireResumeUpload,true);
});

test('planning stops exactly at a smaller specified search budget',()=>{
 const p=buildDiscoveryPlan({...c,maxDiscoverySearchesPerRun:123});
 assert.equal(p.browserTasks.length,123);
 assert.equal(new Set(p.browserTasks.slice(0,25).map(x=>x.source)).size,25);
});

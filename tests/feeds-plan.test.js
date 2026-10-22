import test from 'node:test';
import assert from 'node:assert/strict';
import {convertJobicy,convertRemotive,discoverFromFeed} from '../src/feeds.js';
import {buildDiscoveryPlan} from '../src/discovery-plan.js';
import {isJobUrl} from '../src/discover.js';
const config={sources:['jobicy','linkedin','simplify','greenhouse','remotive'],searchQueries:['software engineer remote','android developer remote','java developer remote'],maxDiscoverySearchesPerRun:6,maxQueriesPerSource:3,preferredKeywords:['java'],maxFeedPages:2};
const job=(title,id,region='USA')=>({id,url:`https://jobicy.com/jobs/${id}-software-role`,jobTitle:title,jobGeo:region,jobExcerpt:'Fully remote in United States',pubDate:'2026-10-14T12:00:00Z'});

test('balanced source plan reaches all sites before next query round',()=>{
 const plan=buildDiscoveryPlan(config);
 assert.deepEqual(plan.feeds.map(x=>x.source),['jobicy','remotive']);
 assert.deepEqual(plan.browserTasks.map(x=>x.source),['linkedin','simplify','greenhouse','linkedin','simplify','greenhouse']);
 assert.equal(plan.browserTasks.length,6);
});
test('Jobicy feed validates job role and US eligibility and rejects senior/unrelated jobs',()=>{
 const jobs=convertJobicy({jobs:[job('Junior Software Engineer',1),job('Senior Software Engineer',2),job('Junior Software Engineer',3,'Europe'),job('Customer Support Associate',4)]},config);
 assert.equal(jobs.length,1);
 assert.equal(jobs[0].url,'https://jobicy.com/jobs/1-software-role');
 assert.ok(isJobUrl(jobs[0].url,'jobicy'));
});
test('Remotive feed selects supported remote development roles',()=>{
 const items=[{title:'Frontend React Developer',url:'https://remotive.com/remote-jobs/software-dev/frontend-react-dev-123',candidate_required_location:'Worldwide',id:1},{title:'Senior Backend Developer',url:'https://remotive.com/remote-jobs/software-dev/senior-backend-dev-124',candidate_required_location:'USA',id:2},{title:'Junior Java Developer',url:'https://remotive.com/remote-jobs/software-dev/junior-java-dev-125',candidate_required_location:'Europe',id:3}];
 assert.deepEqual(convertRemotive({jobs:items},config).map(x=>x.feedId),['1']);
 assert.ok(isJobUrl(items[0].url,'remotive'));
});
test('feed pagination de-duplicates and preserves cursor correctly',async()=>{
 const urls=[];
 const fakeFetch=async url=>{
   urls.push(url);
   return {ok:true,json:async()=>urls.length===1?{jobs:[job('Junior Software Engineer',1)],hasMore:true,nextCursor:'cursor/abc +'}:{jobs:[job('Junior Software Engineer',1),job('Android Developer',2)],hasMore:false,nextCursor:null}};
 };
 const items=await discoverFromFeed('jobicy',config,50,{fetchFn:fakeFetch});
 assert.equal(urls.length,2);
 assert.equal(new URL(urls[1]).searchParams.get('cursor'),'cursor/abc +');
 assert.deepEqual(items.map(x=>x.feedId),['1','2']);
});
test('feed failure propagates to caller for fallback, rather than fabricating jobs',async()=>{
 await assert.rejects(()=>discoverFromFeed('remotive',config,5,{fetchFn:async()=>({ok:false,status:429})}),/429/);
});

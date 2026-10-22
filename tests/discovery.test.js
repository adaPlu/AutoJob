import test from 'node:test';
import assert from 'node:assert/strict';
import { isJobUrl, normalizeUrl, fitScore } from '../src/discover.js';
import { plausibleRoleTitle, postingRemoteStatus, classificationFromApplication } from '../src/eligibility.js';
const reject=[
['linkedin','https://www.linkedin.com/jobs/'],
['glassdoor','https://www.glassdoor.com/Job/remote-junior-software-engineer-jobs-SRCH_KO0,31.htm'],
['ziprecruiter','https://www.ziprecruiter.com/co/USAA/Jobs/-in-Plano,TX'],
['jobright','https://jobright.ai/jobs/remote-junior-software-engineer-jobs-in-united-states'],
['weworkremotely','https://weworkremotely.com/remote-jobs/search?term=junior+software+engineer+remote'],
['remoteco','https://remote.co/remote-jobs/developer']
];
test('rejects historical listing / search pages',()=>{for(const [s,url] of reject) assert.equal(isJobUrl(normalizeUrl(url,url),s),false,`${s}: ${url}`);});
test('retains canonical actual job detail pages',()=>{
  const examples=[['linkedin','https://www.linkedin.com/jobs/search-results/?currentJobId=4476001542'],['wellfound','https://wellfound.com/jobs/3840513-llm-platform-engineer'],['dice','https://www.dice.com/job-detail/bf8c2ff2-ac97-4e06-9ba1-e6de9f93b828'],['jobright','https://jobright.ai/jobs/info/6a9192e1360363009919311f']];
  for(const [s,url] of examples) assert.equal(isJobUrl(normalizeUrl(url,url),s),true,url);
  assert.equal(normalizeUrl('https://www.linkedin.com/jobs/view/1234/?eBP=x','https://www.linkedin.com'), 'https://www.linkedin.com/jobs/view/1234/');
});
test('rejects unrelated roles and navigation labels',()=>{
  for(const t of ['Growth Product Manager','Benefits','Jobs','Cinematography Artist','Head of Engineering','1100 junior software jobs in Denver']) assert.equal(plausibleRoleTitle(t),false,t);
  for(const t of ['Junior Software Engineer','Android Developer','Machine Learning Engineer','Full Stack Developer']) assert.equal(plausibleRoleTitle(t),true,t);
});
test('role fit does not count AI inside ordinary words',()=>{
  assert.equal(fitScore('Retail assistant',{preferredKeywords:['ai']}),0);
  assert.equal(fitScore('AI engineer',{preferredKeywords:['ai']}),1);
});
test('remote work gate and auth gate',()=>{
 assert.equal(postingRemoteStatus('Location: Remote - United States').eligible,true);
 assert.equal(postingRemoteStatus('Hybrid work, 3 days in office. Remote options').eligible,false);
 assert.equal(classificationFromApplication('Sign in with email address and password'),'authentication-required');
 assert.equal(classificationFromApplication('Please complete the CAPTCHA'),'blocked');
});

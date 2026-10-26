// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import path from 'node:path';
import { SOURCE_DEFS } from './discover.js';
import { FEED_SOURCES } from './feeds.js';
import { plausibleRoleTitle } from './eligibility.js';

export function inspectConfiguration(config,profile,resumePath,{dryRun=false}={}) {
  const errors=[],warnings=[];
  if(config.autoSubmit !== true && !dryRun) errors.push('autoSubmit is false: no final submissions will be made. Set true in reviewed config.json or run --dry-run.');
  if(config.strictRemote !== true) warnings.push('strictRemote is not true: non-remote job postings could be included.');
  if(config.requireResumeUpload !== true) warnings.push('requireResumeUpload is not true: applications could be sent without the resume.');
  if(!resumePath || !fs.existsSync(resumePath)) errors.push(`Resume file missing or unconfigured: ${resumePath||'resumePath is blank'}`);
  else if(!/\.(pdf|docx?)$/i.test(path.basename(resumePath))) warnings.push('Resume path is not a PDF, DOC or DOCX.');
  for(const key of ['firstName','lastName','email','phone']) if(!String(profile[key]||'').trim()) errors.push(`profile.${key} is missing`);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(profile.email||''))) errors.push('profile.email is not a valid address');
  if(!Array.isArray(config.searchQueries)||!config.searchQueries.length) errors.push('No searchQueries configured');
  if(!Array.isArray(config.sources)||!config.sources.length) errors.push('No sources configured');
  for(const s of config.sources||[]) if(!SOURCE_DEFS[s]) warnings.push(`Unsupported discovery source ${s}`);
  const browserSources=[...new Set((config.sources||[]).filter(s=>SOURCE_DEFS[s]&&!FEED_SOURCES.has(s)))];
  const searchBudget=Math.max(1,Math.min(100,Number(config.maxDiscoverySearchesPerRun)||100));
  if(browserSources.length>searchBudget)warnings.push(`Discovery budget ${searchBudget} cannot cover all ${browserSources.length} browser sources even once; increase maxDiscoverySearchesPerRun.`);
  if(config.simplifyCopilot?.enabled === true) warnings.push('Simplify Copilot requires an installed, signed-in extension in the dedicated Chrome profile; preflight cannot verify browser extension installation.');
  if(config.maxJobsPerRun>20) warnings.push('High-volume run requested: watch first applications and review receipts before relying on aggregate counts.');
  if((config.maxJobAttempts||0)>3) warnings.push('High retry count: cap retries and review uncertain outcomes.');
  if(profile.skills && !Array.isArray(profile.skills)) errors.push('profile.skills must be an array');
  if(profile.applicationAnswers && (typeof profile.applicationAnswers!=='object' || Array.isArray(profile.applicationAnswers))) errors.push('profile.applicationAnswers must be a question-to-answer object');
  return {ok:errors.length===0,errors,warnings,mode:dryRun?'dry-run':'live-submit',
    maxJobsPerRun:config.maxJobsPerRun,autoSubmit:config.autoSubmit===true,
    resumeConfigured:!!(resumePath&&fs.existsSync(resumePath)),sources:(config.sources||[]).length};
}

export function requirePreflight(report) {
  console.log('\n========= PRE-FLIGHT =========');
  console.log(JSON.stringify(report,null,2));
  console.log('==============================\n');
  if(!report.ok) throw new Error(`Preflight failed: ${report.errors.join('; ')}`);
  return report;
}

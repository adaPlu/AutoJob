// SPDX-License-Identifier: MIT
import { plausibleRoleTitle } from './eligibility.js';
import { normalizeUrl } from './discover.js';

// Public discovery feeds only. They are NOT application submission services.
// Keep these calls few, respect rate limits, and do not bypass CAPTCHAs.
const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const safeUrl = raw => {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol)) return '';
    return normalizeUrl(u.toString(),u.toString());
  } catch { return ''; }
};
function allowedRegion(region) {
  const s = clean(region).toLowerCase();
  if (!s || /^(anywhere|worldwide|global|remote|us|usa|united states(?: only)?|north america(?: only)?)$/i.test(s)) return true;
  if (/(united states|\busa\b|\bu\.s\.\b|\bu\.s\b|\bus only\b|north america)/i.test(s)) return true;
  return false;
}
function accepted(title, text, config) {
  if (!plausibleRoleTitle(title,config)) return false;
  const block = /\b(senior|sr\.?|lead|principal|staff|director|head of|vp|chief)\b/i;
  if (block.test(title) && (config.excludeSeniorFeedRoles ?? true)) return false;
  // Jobs are matched by real title, never 'apply now' anchor text.
  const keys = config.preferredKeywords || [];
  const titleSkills = /\b(software|engineer|developer|full.?stack|front.?end|back.?end|python|java|kotlin|android|ios|react|robotics|machine learning|ai|mlops|devops)\b/i;
  return titleSkills.test(title) && (!config.feedKeywordFilter || keys.some(k => `${title} ${text}`.toLowerCase().includes(String(k).toLowerCase())));
}
function byNewest(a,b) { return (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0); }

export function convertJobicy(data, config) {
  const out=[];
  for (const item of Array.isArray(data?.jobs)?data.jobs:[]) {
    const title=clean(item.jobTitle),url=safeUrl(item.url);
    if (!url || !/jobicy\.com$/.test(new URL(url).hostname) || !allowedRegion(item.jobGeo)) continue;
    if (!accepted(title,`${item.jobExcerpt || ''} ${item.jobDescription || ''}`,config)) continue;
    out.push({source:'jobicy',url,anchorText:title,title,company:clean(item.companyName),query:'Jobicy remote API',publishedAt:item.pubDate||'',region:clean(item.jobGeo),feedId:String(item.id||'')});
  }
  return out.sort(byNewest);
}
export function convertRemotive(data,config) {
  const out=[];
  for(const item of Array.isArray(data?.jobs)?data.jobs:[]) {
    const title=clean(item.title),url=safeUrl(item.url);
    if (!url || !new URL(url).hostname.endsWith('remotive.com') || !allowedRegion(item.candidate_required_location)) continue;
    if (!accepted(title, item.description,config)) continue;
    out.push({source:'remotive',url,anchorText:title,title,company:clean(item.company_name),query:'Remotive remote API',publishedAt:item.publication_date||'',region:clean(item.candidate_required_location),feedId:String(item.id||'')});
  }
  return out.sort(byNewest);
}

async function jsonFetch(url,fetchFn,externalSignal) {
  const controller=new AbortController();
  const propagateAbort=()=>controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) propagateAbort();
  else externalSignal?.addEventListener('abort',propagateAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('Feed request timed out')),18000);
  try {
    const response=await fetchFn(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error(`Feed HTTP ${response.status}`);
    const obj=await response.json();
    if (obj?.success === false) throw new Error(String(obj.error||'Feed rejected request'));
    return obj;
  } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort',propagateAbort); }
}
export async function discoverFromFeed(source,config,limit=80,{fetchFn=globalThis.fetch,signal}={}) {
  const cap=Math.max(1,Math.min(200,Number(limit)||80));
  if(source==='jobicy') {
    const uri=new URL('https://jobicy.com/api/v2/remote-jobs');
    uri.searchParams.set('count','100');uri.searchParams.set('geo','usa');uri.searchParams.set('industry','engineering');
    const out=[],seen=new Set();
    const pages=Math.max(1,Math.min(3,Number(config.maxFeedPages)||2));
    let cursor='';
    for (let page=0;page<pages;page++) {
      if (cursor) uri.searchParams.set('cursor',cursor);
      if(signal?.aborted)throw signal.reason;
      const data=await jsonFetch(uri.toString(),fetchFn,signal);
      for (const job of convertJobicy(data,config)) if(!seen.has(job.url)){seen.add(job.url);out.push(job);}
      if(out.length>=cap || !data.nextCursor || !data.hasMore) break;
      cursor=String(data.nextCursor);
    }
    return out.slice(0,cap);
  }
  if(source==='remotive') {
    const uri='https://remotive.com/api/remote-jobs?category=software-dev&limit=100';
    return convertRemotive(await jsonFetch(uri,fetchFn,signal),config).slice(0,cap);
  }
  return [];
}
export const FEED_SOURCES=new Set(['jobicy','remotive']);
